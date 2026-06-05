import { spawnSync } from 'child_process';

export type RunOptions = {
	cwd?: string;
};

export function run(cmd: string, args: string[], opts?: RunOptions) {
	const res = spawnSync(cmd, args, {
		stdio: 'inherit',
		cwd: opts?.cwd,
		env: process.env,
	});
	if (res.status !== 0) {
		throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
	}
}
