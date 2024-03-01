import tensorflow as tf
import psycopg2
import json
import time
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

postgres_conn = psycopg2.connect(
    **{
        "host": "postgres",
        "port": 5432,
        "user": "postgres",
        "password": "congestiometro",
        "dbname": "postgres",
    }
)

try:
    model = tf.keras.models.load_model("./model")
except:
    from train import train

    model = train(postgres_conn)

@app.route("/predict", methods=["POST"])
def predict():
    try:
        prediction_data = json.loads(request.data)#.decode("utf-8"))
        with open("./query.sql") as query_string:
            q = query_string.read().format(**prediction_data)
            with postgres_conn.cursor() as cursor:
                cursor.execute(q)
                res = cursor.fetchall()
                app.logger.debug("El resultado es el siguiente:")
                app.logger.debug(res)
                app.logger.debug("\n"*5)
                time.sleep(5)
                date_from_as_datetime = datetime.strptime(prediction_data["date_from"], "%Y-%m-%d %H:%M:%S")
                #date_to_as_datetime = datetime.strptime(prediction_data["date_to"], "%Y-%m-%d %H:%M:%S")
                history_input_data = {
                    "val7": res[2],
                    "val14": res[3],
                    "val21": res[4],
                    "val364": res[5]
                }
                inputs_data = {
                    "lines_input": list(prediction_data["lines"]),
                    "week_input": date_from_as_datetime.isocalendar().week,
                    "dow_input": date_from_as_datetime.isocalendar().weekday,
                    "metric_input": prediction_data["metric"],
                    "aggfun_input": prediction_data["agg_func"],
                    "history_input": history_input_data
                }
                outputs_data = model.predict(inputs_data, verbose=0)
                app.logger.debug("El resultado FINAL es el siguiente:")
                app.logger.debug(str(outputs_data))
                app.logger.debug("\n"*5)
                return jsonify(outputs_data)
    except Exception as err:
        app.logger.log(err.with_traceback())
        return jsonify({"status": "unexpected error"}), 500

cdef public void run_prediction_model_main():
    app.run(host="0.0.0.0", port=6001, debug=True)