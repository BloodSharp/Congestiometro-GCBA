
/*
 * This file is slightly modified from
 * https://cython.readthedocs.io/en/latest/src/tutorial/embedding.html
 */

#include "../build/src/model_module.h"

#ifdef __cplusplus

extern "C"
{

#endif

  int

  main (int argc, char *argv[])

  {

    PyObject *pmodule;

    wchar_t *program;

    program = Py_DecodeLocale (argv[0], NULL);

    if (program == NULL)
      {

        fprintf (stderr,
                 "Fatal error: cannot decode argv[0], got %d arguments\n",
                 argc);

        exit (1);
      }

    /* Add a built-in module, before Py_Initialize */

    if (PyImport_AppendInittab ("modelo_ia", PyInit_model_module) == -1)
      {

        fprintf (stderr, "Error: could not extend in-built modules table\n");

        exit (1);
      }

    /* Pass argv[0] to the Python interpreter */

    Py_SetProgramName (program);

    /* Initialize the Python interpreter.  Required.

       If this step fails, it will be a fatal error. */

    Py_Initialize ();

    /* Optionally import the module; alternatively,

       import can be deferred until the embedded script

       imports it. */

    pmodule = PyImport_ImportModule ("modelo_ia");

    if (!pmodule)
      {

        PyErr_Print ();

        fprintf (stderr, "Error: could not import module 'modelo_ia'\n");

        goto exit_with_error;
      }

    /* Now call into your module code. */

    /*
    if (say_hello_from_python() < 0) {

        PyErr_Print();

        fprintf(stderr, "Error in Python code, exception was printed.\n");

        goto exit_with_error;

    }
    */
    run_prediction_model_main ();

    /* ... */

    /* Clean up after using CPython. */

    PyMem_RawFree (program);

    Py_Finalize ();

    return 0;

    /* Clean up in the error cases above. */

  exit_with_error:

    PyMem_RawFree (program);

    Py_Finalize ();

    return 1;
  }

#ifdef __cplusplus
}

#endif