import { $ } from "bun";
import type { GitCommit, UpstreamStatus } from "./types";

/**
 * 获取 Git 远程仓库信息
 */
export async function getRemotes(cwd: string): Promise<Map<string, string>> {
	const result = await $`git remote -v`.cwd(cwd).quiet().nothrow();
	if (result.exitCode !== 0) {
		throw new Error("Not a git repository");
	}

	const remotes = new Map<string, string>();
	const lines = result.text().split("\n");

	for (const line of lines) {
		const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
		if (match) {
			remotes.set(match[1], match[2]);
		}
	}

	return remotes;
}

/**
 * 获取当前分支名称
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
	const result = await $`git branch --show-current`.cwd(cwd).quiet().nothrow();
	if (result.exitCode !== 0) {
		throw new Error("Failed to get current branch");
	}
	return result.text().trim();
}

/**
 * Fetch upstream
 */
export async function fetchUpstream(cwd: string, remote: string): Promise<void> {
	const result = await $`git fetch ${remote}`.cwd(cwd).quiet().nothrow();
	if (result.exitCode !== 0) {
		throw new Error(`Failed to fetch ${remote}`);
	}
}

/**
 * 获取提交列表
 */
export async function getCommits(cwd: string, range: string, limit = 50): Promise<GitCommit[]> {
	const format = "%H|%h|%s|%an|%ad|%ar";
	const result = await $`git log ${range} --pretty=format:${format} --date=short -n ${limit}`.cwd(cwd).quiet().nothrow();

	if (result.exitCode !== 0) {
		return [];
	}

	const commits: GitCommit[] = [];
	const lines = result.text().split("\n").filter(Boolean);

	for (const line of lines) {
		const [hash, shortHash, message, author, date, relativeDate] = line.split("|");

		// 获取文件变更
		const filesResult = await $`git diff-tree --no-commit-id --name-only -r ${hash}`.cwd(cwd).quiet().nothrow();
		const files = filesResult.exitCode === 0 ? filesResult.text().split("\n").filter(Boolean) : [];

		// 获取变更行数
		const statsResult = await $`git show --stat --format= ${hash}`.cwd(cwd).quiet().nothrow();
		let linesAdded = 0;
		let linesRemoved = 0;

		if (statsResult.exitCode === 0) {
			const statsMatch = statsResult.text().match(/(\d+) insertion.*?(\d+) deletion/);
			if (statsMatch) {
				linesAdded = parseInt(statsMatch[1], 10);
				linesRemoved = parseInt(statsMatch[2], 10);
			} else {
				const insertMatch = statsResult.text().match(/(\d+) insertion/);
				const deleteMatch = statsResult.text().match(/(\d+) deletion/);
				if (insertMatch) linesAdded = parseInt(insertMatch[1], 10);
				if (deleteMatch) linesRemoved = parseInt(deleteMatch[1], 10);
			}
		}

		commits.push({
			hash,
			shortHash,
			message,
			author,
			date,
			relativeDate,
			files,
			linesAdded,
			linesRemoved,
		});
	}

	return commits;
}

/**
 * 获取 Upstream 状态
 */
export async function getUpstreamStatus(
	cwd: string,
	remote: string,
	branch: string,
	skipFetch = false,
): Promise<UpstreamStatus> {
	// 获取当前分支
	const localBranch = await getCurrentBranch(cwd);

	// 可选：fetch upstream
	if (!skipFetch) {
		await fetchUpstream(cwd, remote);
	}

	// 获取本地 HEAD
	const localHeadResult = await $`git rev-parse HEAD`.cwd(cwd).quiet().nothrow();
	const localHead = localHeadResult.exitCode === 0 ? localHeadResult.text().trim().slice(0, 7) : "unknown";

	// 获取 upstream HEAD
	const upstreamBranchRef = `${remote}/${branch}`;
	const upstreamHeadResult = await $`git rev-parse ${upstreamBranchRef}`.cwd(cwd).quiet().nothrow();
	const upstreamHead = upstreamHeadResult.exitCode === 0 ? upstreamHeadResult.text().trim().slice(0, 7) : "unknown";

	// 获取 ahead/behind 计数
	const countResult = await $`git rev-list --left-right --count HEAD...${upstreamBranchRef}`.cwd(cwd).quiet().nothrow();

	let ahead = 0;
	let behind = 0;

	if (countResult.exitCode === 0) {
		const [aheadStr, behindStr] = countResult.text().trim().split("\t");
		ahead = parseInt(aheadStr, 10);
		behind = parseInt(behindStr, 10);
	}

	// 获取提交列表
	const behindCommits = behind > 0 ? await getCommits(cwd, `HEAD..${upstreamBranchRef}`, behind) : [];
	const aheadCommits = ahead > 0 ? await getCommits(cwd, `${upstreamBranchRef}..HEAD`, ahead) : [];

	return {
		localBranch,
		upstreamBranch: branch,
		localHead,
		upstreamHead,
		behind,
		ahead,
		behindCommits,
		aheadCommits,
	};
}

/**
 * 获取单个提交的详细信息
 */
export async function getCommitDetail(cwd: string, hash: string): Promise<GitCommit | null> {
	const commits = await getCommits(cwd, hash, 1);
	return commits[0] || null;
}

/**
 * 获取提交的 diff 内容
 */
export async function getCommitDiff(cwd: string, hash: string): Promise<string> {
	const result = await $`git show ${hash} --format= --stat`.cwd(cwd).quiet().nothrow();
	return result.exitCode === 0 ? result.text() : "";
}
