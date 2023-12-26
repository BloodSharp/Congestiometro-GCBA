#!/bin/bash

if [ "$#" -eq 0 ]; then
    echo "No se pasaron parámetros al script, estableciendo modo producción..."
    ENVIRONTMEND_MODE="production"
fi

if [ "$1" == "development" ]; then
    echo "Estableciendo modo desarrollo..."
    ENVIRONTMEND_MODE="development"
fi

# Inicializando la configuración del servicio administrador
npm --prefix ./admin install
npm --prefix ./admin format
npm --prefix ./admin start

# Inicializando el contenedor del frontend
npm --prefix ./ui install
npm --prefix ./ui format
if [ ENVIRONTMEND_MODE == "production" ]; then
    npm --prefix ./ui run build-production
elif [ ENVIRONTMEND_MODE == "development" ]; then
    npm --prefix ./ui run build
fi

docker-compose up -d
