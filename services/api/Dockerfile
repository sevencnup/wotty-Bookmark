FROM rust:1.85-bookworm AS builder
WORKDIR /app
COPY services/api/Cargo.toml services/api/Cargo.lock* services/api/
COPY services/api/src services/api/src
COPY migrations migrations
WORKDIR /app/services/api
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN useradd --system --create-home --uid 10001 app
RUN mkdir -p /var/lib/bookmark-vault && chown -R app:app /var/lib/bookmark-vault
USER app
COPY --from=builder /app/services/api/target/release/bookmark-vault-api /usr/local/bin/bookmark-vault-api
EXPOSE 8080
ENV BIND_ADDR=0.0.0.0:8080
ENTRYPOINT ["/usr/local/bin/bookmark-vault-api"]
