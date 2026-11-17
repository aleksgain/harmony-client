.PHONY: install dev build dist dist-win dist-mac dist-linux lint format typecheck clean

install:
	npm install

dev: node_modules
	npm run dev

build: node_modules
	npm run build

dist: node_modules
	npm run dist

dist-win: node_modules
	npm run dist:win

dist-mac: node_modules
	npm run dist:mac

dist-linux: node_modules
	npm run dist:linux

lint: node_modules
	npm run lint

format: node_modules
	npm run format

typecheck: node_modules
	npm run typecheck

clean:
	rm -rf out dist

node_modules: package.json
	npm install
	@touch node_modules
