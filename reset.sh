#!/bin/bash

./stop.sh

if [ "$#" -eq 0 ]; then
    ./startup.sh production
elif [ "$1" == "development" ]; then
    ./startup.sh development
else
    ./startup.sh production
fi
