#!/usr/bin/env python3
"""Read-only migration inventory. A healthy baseline does not authorize cutover."""
import argparse
import datetime as dt
import json
import ipaddress
import os
import pathlib
import re
import socket
import subprocess
import urllib.request

STACK = "clica-evolution-qa"
SERVICES = [f"{STACK}_{name}" for name in ("evolution", "postgres", "redis")]
VOLUMES = {
    SERVICES[0]: (STACK + '_evolution_instances', '/evolution/instances'),
    SERVICES[1]: (STACK + '_postgres_data', '/var/lib/postgresql/data'),
    SERVICES[2]: (STACK + '_redis_data', '/data'),
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def panel_setup_status():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open('http://127.0.0.1:3000/api/getSetupStatus', timeout=5) as response:
        return json.loads(response.read(16384)).get('isComplete')


def command(*args):
    return subprocess.check_output(args, text=True, timeout=20).strip()


def service_inventory(name):
    raw = json.loads(command("docker", "service", "inspect", name))[0]
    spec = raw["Spec"]
    container = spec["TaskTemplate"]["ContainerSpec"]
    ids = command("docker", "ps", "-q",
                  "--filter", "label=com.docker.swarm.service.name=" + name).split()
    tasks = []
    for container_id in ids:
        task = json.loads(command("docker", "inspect", container_id))[0]
        tasks.append({
            "id": container_id,
            "health": task["State"].get("Health", {}).get("Status"),
            "running": task["State"].get("Running", False),
        })
    return {
        "name": name, "id": raw["ID"], "image": container["Image"],
        "replicas": spec.get("Mode", {}).get("Replicated", {}).get("Replicas"),
        "ports": spec.get("EndpointSpec", {}).get("Ports", []),
        "mounts": [{"type": m["Type"], "source": m.get("Source"),
                    "target": m["Target"]} for m in container.get("Mounts", [])],
        "secret_names": [s["SecretName"] for s in container.get("Secrets", [])],
        "config_names": [c["ConfigName"] for c in container.get("Configs", [])],
        "tasks": tasks,
    }


def running_volume_writers():
    writers = {}
    for container_id in command("docker", "ps", "-q").split():
        item = json.loads(command("docker", "inspect", container_id))[0]
        for mount in item.get("Mounts", []):
            if mount["Type"] == "volume" and mount.get("RW", False):
                writers.setdefault(mount["Name"], []).append(container_id)
    return writers


def resolve_ipv4(hostname):
    try:
        return sorted({r[4][0] for r in socket.getaddrinfo(
            hostname, 443, socket.AF_INET, socket.SOCK_STREAM)})
    except socket.gaierror:
        return []


def evaluate(inventory, expected):
    blockers = []
    dns = inventory["panel_ipv4"]
    if set(dns) != {expected}:
        blockers.append("PANEL_DNS_MISSING_OR_NOT_EXCLUSIVELY_TARGET")
    if inventory.get("panel_setup_complete") is not True:
        blockers.append("PANEL_SETUP_UNCONFIRMED")
    if inventory.get("whatsapp_enabled") is not False:
        blockers.append("WORKER_PAUSE_UNCONFIRMED")
    for name in SERVICES:
        service = inventory["services"].get(name)
        if not service:
            blockers.append("MISSING_SERVICE:" + name)
            continue
        if service["replicas"] != 1 or len(service["tasks"]) != 1 or any(
                not t["running"] or t["health"] != "healthy"
                for t in service["tasks"]):
            blockers.append("UNHEALTHY_OR_MULTIPLE_TASKS:" + name)
        if not re.fullmatch(r'[^\s@]+@sha256:[a-f0-9]{64}', service["image"]):
            blockers.append("UNPINNED_IMAGE:" + name)
        if service["ports"]:
            blockers.append("WORKLOAD_HAS_PUBLISHED_PORTS:" + name)
        volumes = [m for m in service["mounts"] if m["type"] == "volume"]
        source, target = VOLUMES[name]
        if len(volumes) != 1 or volumes[0].get('source') != source or volumes[0].get('target') != target:
            blockers.append("PERSISTENCE_CONTRACT_MISMATCH:" + name)
        for mount in volumes:
            actual = inventory["writers"].get(mount["source"], [])
            expected_ids = [t["id"] for t in service["tasks"] if t["running"]]
            if len(actual) != 1 or actual != expected_ids:
                blockers.append("UNCONFIRMED_SINGLE_WRITER:" + name)
        if not service["secret_names"]:
            blockers.append("MISSING_CREDENTIAL_MOUNTS:" + name)
    backup = inventory.get("backup", {})
    try:
        if not all(isinstance(backup.get(k), str) for k in ('captured_at', 'verified_at')):
            raise ValueError('invalid timestamps')
        captured = dt.datetime.fromisoformat(backup["captured_at"].replace("Z", "+00:00"))
        verified = dt.datetime.fromisoformat(backup["verified_at"].replace("Z", "+00:00"))
        observed = dt.datetime.fromisoformat(inventory["observed_at"])
        if not 0 <= (observed - captured).total_seconds() <= 86400 or not captured <= verified <= observed:
            raise ValueError("stale or future backup")
        if backup.get("failed") is not False:
            raise ValueError("failed or unknown backup")
    except (KeyError, ValueError, TypeError):
        blockers.append("FRESH_VERIFIED_BACKUP_UNCONFIRMED")
    if inventory.get("pending_recovery") is not False:
        blockers.append("BACKUP_RECOVERY_PENDING_OR_UNKNOWN")
    return blockers


def collect(hostname):
    report = {
        "observed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "panel_ipv4": resolve_ipv4(hostname), "services": {}, "errors": [],
        "writes_performed": False, "cutover_authorized": False,
    }
    for name in SERVICES:
        try:
            report["services"][name] = service_inventory(name)
        except (OSError, ValueError, subprocess.SubprocessError):
            report["errors"].append("SERVICE_INSPECTION_FAILED:" + name)
    report["writers"] = running_volume_writers()
    try:
        report["panel_setup_complete"] = panel_setup_status()
    except (OSError, ValueError, AttributeError):
        report["panel_setup_complete"] = None
    config = pathlib.Path("/etc/clicaepede/kan135/config.json")
    try:
        settings = json.loads(config.read_text())
        report["whatsapp_enabled"] = settings.get("whatsapp_enabled")
        report["billing_enabled"] = settings.get("billing_enabled")
    except (OSError, ValueError, AttributeError):
        report["whatsapp_enabled"] = None
    root = pathlib.Path("/var/lib/clicaepede/kan133")
    try:
        backup = json.loads((root / "last_backup.json").read_text())
        report["backup"] = {k: backup.get(k) for k in
                            ("captured_at", "verified_at", "failed")}
        # Same authoritative marker used by KAN-133 recovery.
        report["pending_recovery"] = os.path.lexists(root / "maintenance.json")
    except (OSError, ValueError, AttributeError):
        report["backup"] = {}
        report["pending_recovery"] = None
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-ip", required=True)
    parser.add_argument("--panel-host", default="painel.clicaepede.com.br")
    args = parser.parse_args()
    try:
        ipaddress.IPv4Address(args.expected_ip)
        report = collect(args.panel_host)
        report["blockers"] = evaluate(report, args.expected_ip) + report["errors"]
        report["baseline_status"] = "BLOCKED" if report["blockers"] else "HEALTHY"
        report["remaining_cutover_gates"] = [
            "AUTHORIZED_PANEL_LOGIN_AND_ACCESS_PROTECTION",
            "SUPPORTED_API_SECRET_NETWORK_AND_CONFIG_COMPATIBILITY",
            "FRESH_ISOLATED_RESTORE_WITH_EXACT_IMAGE_PINS",
            "BACKUP_RECOVERY_AND_SCHEDULER_OWNERSHIP_FENCING",
            "REHEARSED_ROUTING_AND_DATA_PRESERVING_ROLLBACK",
            "EXPLICIT_MAINTENANCE_WINDOW_APPROVAL",
        ]
        print(json.dumps(report, indent=2))
        return 2 if report["blockers"] else 0
    except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError,
            subprocess.SubprocessError):
        print(json.dumps({"baseline_status": "UNAVAILABLE",
                          "writes_performed": False,
                          "cutover_authorized": False,
                          "error": "READ_ONLY_PREFLIGHT_FAILED"}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
