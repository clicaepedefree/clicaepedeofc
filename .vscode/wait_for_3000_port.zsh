#!/bin/zsh

WAIT_TIME=0
SLEEP_STEP=0.5
TIMEOUT=5

while ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; do
    if [[ $WAIT_TIME -ge $TIMEOUT ]];
    then
        echo "TIMEOUT ERROR: port 3000 is not available after $TIMEOUT seconds";
        exit 1;
    fi
    echo "Waiting for $WAIT_TIME seconds...";
    
    sleep $SLEEP_STEP;
    WAIT_TIME=$(($WAIT_TIME + $SLEEP_STEP));
done