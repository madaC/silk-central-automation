/*
 * (c) Copyright 2021-2022 Micro Focus or one of its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import shell from 'shelljs';
import Credentials from '../../model/credentials';

const gitCheckout = (branch: string): void => {
    const result = shell.exec(`git checkout ${branch}`);
    if (result.code !== 0) {
        throw new Error(`git checkout ${branch} failed!\n${result.stderr}`);
    }
};

const gitFetch = (remote?: string, branch?: string): void => {
    let command = 'git fetch';
    if (remote) {
        command += ` ${remote}`;
        if (branch) {
            command += ` ${branch}`;
        }
    }

    const result = shell.exec(command);
    if (result.code !== 0) {
        throw new Error(
            `git fetch ${remote || ''} ${branch || ''} failed!\n${
                result.stderr
            }`
        );
    }
};

const gitClone = (repoUrl: string, folderToCloneInto:string, githubCredentials?: Credentials): void => {
    const isHTTP = repoUrl.startsWith('http');

    if (isHTTP && githubCredentials && !repoUrl.includes('@')) {
        const urlComponents = repoUrl.split('//');
        repoUrl = `${urlComponents[0]}//${githubCredentials.username}:${githubCredentials.pat}@${urlComponents[1]}`;
    }

    const result = shell.exec(`git clone ${repoUrl} ${folderToCloneInto}`);
    if (result.code !== 0) {
        throw new Error(`git clone ${repoUrl} ${folderToCloneInto} failed!\n${result.stderr}`);
    }
};

const gitBranch = (): string => {
    const result = shell.exec('git branch');
    if (result.code !== 0) {
        throw new Error(`git branch failed!\n${result.stderr}`);
    }
    return result.toString();
};

const gitDefaultBranchName = (): string => {
    const branches = gitBranch();
    return branches.includes('main') ? 'main' : 'master';
};

export { gitBranch, gitClone, gitCheckout, gitDefaultBranchName, gitFetch };
