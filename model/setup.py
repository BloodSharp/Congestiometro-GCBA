import os
import sysconfig
from setuptools import find_packages, setup
from setuptools.extension import Extension
from Cython.Build import cythonize
from Cython.Distutils import build_ext

# https://stackoverflow.com/questions/38523941/change-cythons-naming-rules-for-so-files
def get_ext_filename_without_platform_suffix(filename, suffix):
    name, ext = os.path.splitext(filename)
    ext_suffix = suffix

    if ext_suffix == ext:
        return filename

    ext_suffix = ext_suffix.replace(ext, '')

    idx = name.find(ext_suffix)

    if idx == -1:
        return filename
    else:
        return name[:idx] + ext

class BuildExtWithoutPlatformSuffix(build_ext):
    def get_ext_filename(self, ext_name):
        filename = super().get_ext_filename(ext_name)
        modified_filename = get_ext_filename_without_platform_suffix(filename, sysconfig.get_config_var('EXT_SUFFIX'))
        return 'lib'+modified_filename

setup(
    cmdclass={'build_ext': BuildExtWithoutPlatformSuffix},
    name="modelo_ia",
    version="3",
    ext_modules=cythonize(
        [
            Extension(
                name="model_module",
                sources=["./src/model_module.pyx"],
            ),
            Extension(
                name="model_training",
                sources=["./src/model_training.pyx"],
            )
        ],
        build_dir="build",
    ),
)