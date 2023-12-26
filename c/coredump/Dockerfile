FROM debian:12
RUN apt-get update -y && apt-get install -y gcc gdb
WORKDIR /app
COPY . /app
RUN chmod +x upload_core_dump.sh run.sh
RUN gcc -o generate_core_dump generate_core_dump.c
CMD /app/run.sh

