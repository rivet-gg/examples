# MARK: Runner
FROM debian:12
WORKDIR /app

# Install necessary libraries for Unity
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -ms /bin/bash rivet

# Copy the precompiled Unity server files
COPY builds/LinuxServer/ /app
RUN ls /app && chmod +x /app/LinuxServer.x86_64

# Change to user rivet
USER rivet

ENV UNITY_SERVER=1

# Run the server
ENTRYPOINT ["/app/LinuxServer.x86_64", "-batchmode", "-nographics"]
