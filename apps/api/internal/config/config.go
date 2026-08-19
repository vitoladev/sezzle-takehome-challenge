package config

import (
	"cmp"
	"os"
)

const DefaultPort = "8080"

type Config struct {
	Port string
}

func Load() Config {
	return Config{
		Port: envOr("PORT", DefaultPort),
	}
}

func envOr(key, fallback string) string {
	return cmp.Or(os.Getenv(key), fallback)
}
