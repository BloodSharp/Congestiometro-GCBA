#!/bin/bash

# Begin of variables section.

# Gets the current script folder.
CURRENT_SCRIPT_FOLDER=$(cd "${0%/*}" && echo $PWD)

# Gets the current kernel name as lowercase string.
CURRENT_KERNEL_NAME=$(uname -s | tr '[:upper:]' '[:lower:]')

# Gets the current platform architecture.
CURRENT_ARCHITECTURE=$(uname -i)

# Checks if the current architecture name is unknown and replace it as x86_64.
if [ "$CURRENT_ARCHITECTURE" == "unknown" ]; then
    CURRENT_ARCHITECTURE=x86_64
fi

CURRENT_PYTHON_THREE_FULL_VERSION=$(python3 -V)
# Gets the current python 3 version. Example: $(python3 -V) will return "Python 3.10.12" as output, this variable
# will be used to get the value as "3.10".
CURRENT_PYTHON_THREE_VERSION=$(echo ${CURRENT_PYTHON_THREE_FULL_VERSION} | awk '{print $2}' | cut -d '.' -f 1-2)
# Gets the same thing but the value is "310"
CURRENT_PYTHON_THREE_VERSION_NO_DOTS=$(echo ${CURRENT_PYTHON_THREE_FULL_VERSION} | awk '{print $2}' | cut -d '.' -f 1-2 | tr -d '.')

# Sets the compile flags and linker flags values for the C compiler.
CFLAGS=$(python${CURRENT_PYTHON_THREE_VERSION}-config --cflags --embed)
LDFLAGS=$(python${CURRENT_PYTHON_THREE_VERSION}-config --embed --ldflags)

# Gets the full model module name and verify it the module as cython exists in a first place.
MODEL_MODULE_SHARED_OBJECT_CYTHON=./build/lib.${CURRENT_KERNEL_NAME}-${CURRENT_ARCHITECTURE}-cpython-${CURRENT_PYTHON_THREE_VERSION_NO_DOTS}/libmodel_module.so
MODEL_MODULE_SHARED_OBJECT_PYTHON=./build/lib.${CURRENT_KERNEL_NAME}-${CURRENT_ARCHITECTURE}-${CURRENT_PYTHON_THREE_VERSION}/libmodel_module.so

FINAL_MODEL_MODULE_SHARED_OBJECT=${MODEL_MODULE_SHARED_OBJECT_CYTHON}
if [ ! -f $FINAL_MODEL_MODULE_SHARED_OBJECT ]; then
    FINAL_MODEL_MODULE_SHARED_OBJECT=${MODEL_MODULE_SHARED_OBJECT_PYTHON}
fi

FILES=('./libmodel_module.so' './model-application' './build/model_module.c' './build/model_module.h' $FINAL_MODEL_MODULE_SHARED_OBJECT)
ALL_FILES_ARE_AVAILABLE=true

# End of variables section.

# Step 1: Verify that all files are present at the current working directory.
for filename in ${FILES[@]}; do
    if [ ! -f $filename ]; then
        ALL_FILES_ARE_AVAILABLE=false
        echo "Warning: File $filename is missing."
        break
    fi
done

# Step 2: If there is at least one missing file at the current working directory, then build remove them all
# and start
if [ "$ALL_FILES_ARE_AVAILABLE" = "false" ]; then
    # Step 3: Remove the build directory, the symbolic link from the model module and the built application.
    rm -Rf build/ libmodel_module.so model-application

    # Step 4: Generate the main application module.
    python${CURRENT_PYTHON_THREE_VERSION} setup.py build_ext

    # Step 5: Sleep a while to allow the container generate the module before continuing.
    sleep 3

    # Step 6: Generate the symbolic link to the main application module.
    ln -s ${FINAL_MODEL_MODULE_SHARED_OBJECT} libmodel_module.so

    # Step 7: Build the main application using the main module.
    gcc ${CFLAGS} -Wno-deprecated-declarations -o model-application model-application.c ${LDFLAGS} -L ${CURRENT_SCRIPT_FOLDER} -lmodel_module
fi

# Finally execute the main application by assigning the current working directory to the linux loader to find
# the main application module as "LD_LIBRARY_PATH=${CURRENT_SCRIPT_FOLDER} ${CURRENT_SCRIPT_FOLDER}/model-application" at the docker compose configuration file.
if [ -f ${CURRENT_SCRIPT_FOLDER}/model-application ]; then
    LD_LIBRARY_PATH=${CURRENT_SCRIPT_FOLDER} ${CURRENT_SCRIPT_FOLDER}/model-application
fi