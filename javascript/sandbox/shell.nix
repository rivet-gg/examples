{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
	buildInputs = with pkgs; [
		nodejs-18_x
		yarn
		pkg-config
		openssl
	];
	shellHook = ''
		export PATH="$PATH:${toString ./.}/../../target/debug:${toString ./.}/../../target/release"
	'';
}
