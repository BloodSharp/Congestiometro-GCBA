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

CURRENT_DIRECTORY=$(pwd)

# Inicializando el contenedor del frontend
cd ./ui
npm install
npm run format
if [ "$ENVIRONTMENT_MODE" = "production" ]; then
    npm run build-production
elif [ "$ENVIRONTMENT_MODE" = "development" ]; then
    npm run build
fi
cd $CURRENT_DIRECTORY

docker-compose up -d
