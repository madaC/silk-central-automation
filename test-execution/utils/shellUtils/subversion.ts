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

const svnCheckout = (repoUrl: string, folderToCheckoutInto:string, svnCredentials?: Credentials): void => {
    const isHTTP = repoUrl.startsWith('http');
    const isSSH = repoUrl.startsWith('svn+ssh');
    let command;

    if (isHTTP && svnCredentials) {
        command = `svn co --non-interactive --no-auth-cache --username "${svnCredentials.username}" --password "${svnCredentials.pat}" ${repoUrl} ${folderToCheckoutInto}`;
    } else if (isSSH && svnCredentials) {
        command = `svn co svn+ssh://${svnCredentials.username}:${
            svnCredentials.pat
        }@${repoUrl.split('svn+ssh://')[1]} ${folderToCheckoutInto}`;
    } else {
        command = `svn co ${repoUrl} ${folderToCheckoutInto}`;
    }
    const result = shell.exec(command);
    if (result.code !== 0) {
        throw new Error(`${command} failed!\n${result.stderr}`);
    }
};

export { svnCheckout };
