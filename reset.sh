#!/bin/bash

./stop.sh

if [ "$#" -eq 0 ]; then
    echo "No se pasaron parámetros al script, estableciendo modo producción..."
    ./startup.sh production
elif [ "$1" == "development" ]; then
    ./startup.sh development
fi
