#!/bin/bash

ENVIRONTMENT_MODE="production"

if [ "$#" -eq 0 ]; then
    echo "No se pasaron parámetros al script, estableciendo modo producción..."
    ENVIRONTMENT_MODE="production"
fi

if [ "$1" == "development" ]; then
    echo "Estableciendo modo desarrollo..."
    ENVIRONTMENT_MODE="development"
fi

# Inicializando los contenedores del congestioemtro
if [ "$ENVIRONTMENT_MODE" = "production" ]; then
    docker-compose up -d
elif [ "$ENVIRONTMENT_MODE" = "development" ]; then
    docker-compose up -f docker-compose.debug.yml -d
fi
