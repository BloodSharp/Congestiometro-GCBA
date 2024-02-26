#FROM tensorflow/tensorflow:2.15.0
FROM debian:bookworm-slim

# Set the /app as the current application directory.
WORKDIR /app

# See the Locales section at https://hub.docker.com/_/debian
RUN \
  apt-get update && apt-get install -y locales && rm -rf /var/lib/apt/lists/* \
	&& localedef -i es_AR -c -f UTF-8 -A /usr/share/locale/locale.alias es_AR.UTF-8
ENV LANG es_AR.utf8

# Install dependencies
RUN \
  apt-get update \
  && apt-get -y --install-recommends install coreutils gcc build-essential python3.11 python3.11-dev python3-full cython3 \
  python3-flask python3-shapely python3-sklearn python3-pandas python3-psycopg2 \
  python3-keras-applications python3-keras-preprocessing

RUN \
  pip3.11 install tensorflow==2.15.0 --break-system-packages