FROM debian:12
RUN apt update -y && \
    apt install -y ca-certificates && \
    update-ca-certificates
COPY ./build/LinuxServer /build
RUN ls /build && chmod +x /build/LinuxServer.x86_64
EXPOSE 7777/udp
ENTRYPOINT ["/build/LinuxServer.x86_64", "-batchmode", "-nographics"]
