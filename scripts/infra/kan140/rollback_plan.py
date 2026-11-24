"""Pure partial-rollback plans, without Engine calls or durable-state access.

The caller owns backup.lock, fencing, completed rollback-copy proof, and fresh
inspection before applying each full spec with Engine CAS. This is not authority
to copy data, resume writers, or publish ownership.
"""
import copy
import math
import re

import managed_cutover as managed
import volume_transfer

ROLES = managed.ROLES


class PlanError(ValueError):
    """Fixed validation codes only; never include snapshot contents."""


def require(value, code):
    if not value:
        raise PlanError(code)


def _json(value):
    if type(value) is dict:
        return all(type(k) is str and _json(v) for k, v in value.items())
    if type(value) is list:
        return all(_json(v) for v in value)
    return (value is None or type(value) in (str, bool, int) or
            (type(value) is float and math.isfinite(value)))


def _same(left, right):
    # Python equality alone treats True as 1, including nested spec fields.
    if type(left) is not type(right):
        return False
    if type(left) is dict:
        return left.keys() == right.keys() and all(_same(left[k], right[k]) for k in left)
    if type(left) is list:
        return len(left) == len(right) and all(_same(a, b) for a, b in zip(left, right))
    return left == right


def _snapshot(service):
    require(type(service) is dict and _json(service), 'service-shape')
    sid = service['ID']
    require(type(sid) is str and re.fullmatch(r'[a-z0-9]{25}', sid), 'service-id')
    version = service['Version']['Index']
    require(type(version) is int and version >= 0, 'service-version')
    spec = service['Spec']
    require(type(spec) is dict, 'service-spec')
    replicas = spec['Mode']['Replicated']['Replicas']
    require(type(replicas) is int and replicas in (0, 1), 'service-replicas')
    require(_same(spec['Mode'], {'Replicated': {'Replicas': replicas}}), 'service-mode')
    mounts = spec['TaskTemplate']['ContainerSpec']['Mounts']
    require(type(mounts) is list and len(mounts) == 1 and type(mounts[0]) is dict,
            'service-mount-shape')
    mount = mounts[0]
    require(mount['Type'] == 'volume' and mount.get('ReadOnly', False) is False,
            'service-mount-shape')
    return sid, version, spec, replicas, mount


def build_plan(stage_records, actual_services, rollback_volumes, destinations):
    """Return all desired FULL specs at replicas zero, or raise PlanError.

    ``rebound`` and ``replicas`` describe the observed service, not the desired
    spec. ``current`` is an independent full snapshot for Engine CAS. All output
    is detached from the inputs, including previously rebound/no-op services.
    """
    try:
        for mapping in (stage_records, actual_services, rollback_volumes, destinations):
            require(type(mapping) is dict and set(mapping) == set(ROLES), 'roles')
        fixed_volumes = dict(zip(ROLES, ('kan140_rollback_' + suffix
                                       for suffix in volume_transfer.SUFFIXES)))
        require(_same(rollback_volumes, fixed_volumes), 'rollback-volumes')
        require(_same(destinations, managed.DESTINATIONS), 'destinations')
        plans, ids = {}, set()
        for role in ROLES:
            record = stage_records[role]
            require(type(record) is dict, 'stage-record')
            sid, version, original, _, old_mount = _snapshot(record['service'])
            require(sid not in ids, 'service-id')
            ids.add(sid)
            require(old_mount['Source'] == managed.OLD_VOLUMES[role] and
                    old_mount['Target'] == destinations[role], 'original-volume')
            actual = actual_services[role]
            actual_id, actual_version, spec, replicas, mount = _snapshot(actual)
            require(actual_id == sid, 'service-id')
            require(actual_version >= version, 'service-version')
            require(mount['Target'] == destinations[role], 'service-mount-target')
            require(mount['Source'] in (managed.OLD_VOLUMES[role], rollback_volumes[role]),
                    'service-mount-source')
            rebound = mount['Source'] == rollback_volumes[role]
            expected = copy.deepcopy(original)
            expected['Mode']['Replicated']['Replicas'] = replicas
            expected['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'] = mount['Source']
            require(_same(spec, expected), 'service-spec-drift')
            require(rebound or replicas == 0, 'original-writer')
            desired = copy.deepcopy(original)
            desired['Mode']['Replicated']['Replicas'] = 0
            desired['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'] = rollback_volumes[role]
            plans[role] = {'service_id': sid, 'spec': desired,
                           'current': copy.deepcopy(actual), 'rebound': rebound,
                           'replicas': replicas}
        require(not (any(not p['rebound'] for p in plans.values()) and
                     any(p['replicas'] == 1 for p in plans.values())),
                'mixed-writer-partial-rebind')
        return plans
    except (KeyError, TypeError, AttributeError, IndexError, RecursionError):
        raise PlanError('invalid-plan-shape') from None
