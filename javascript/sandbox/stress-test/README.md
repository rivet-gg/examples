## Test Locally

**IMPORTANT:** The API endpoints in this stress test is out of date.

```
cargo run -- --base https://api-game.rivet-gg.test/v1 --ref https://test-game.rivet-game.test/ --regions local-lcl -r 1
```

## Increase ulimits

```
sudo -E env "PATH=$PATH" prlimit --nofile=65536 cargo run --release --
```

## Baseline command

```
cargo fmt && sudo -E env "PATH=$PATH" prlimit --nofile=1000000 cargo run --release -- -h 21600 -c 4000 -r 20 --prints-per-second 0.5 --packets-per-second 10
```

## Simulated DoS (100 req/s)

```
cargo fmt && sudo -E env "PATH=$PATH" prlimit --nofile=1000000 cargo run --release -- -c 1000000 -r 200 --prints-per-second 0.5 --no-websocket
```

## Simulate steady load without WebSockets

```
while true; do cargo fmt && sudo -E env "PATH=$PATH" prlimit --nofile=1000000 cargo run --release -- -c 50000 -r 25 --prints-per-second 0.5 --no-websocket; done
```

## Staging

```
cargo run -- -h 21600 --base https://api.rivet.gg --ref https://test-game.rivet.game/ --regions do-sfo -c 10 -r 0.25
```

## Staging test ping

```
cargo run -- -h 21600 --base https://api.rivet.gg --ref https://test-game.rivet.game/ --regions lnd-atl -c 100 --packets-per-second 20 -r 0.1
```
