#!/usr/bin/env bash

"$(npm bin)/set-up-ssh" --key "${encrypted_a9c94e6c75dd_key}" \
	--iv "${encrypted_a9c94e6c75dd_iv}" \
	--path-encrypted-key .travis-github-deploy-key.enc;
