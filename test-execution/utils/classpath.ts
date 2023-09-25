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
import path from 'node:path';

const getAbsoluteClasspath = (
    testWorkingFolder: string,
    classpath: string,
    sourceControlWorkingFolder: string | undefined
): string => {
    const parseSeparator = getSeparator(classpath);
    const jarPaths = classpath.split(parseSeparator);
    let index = jarPaths.length;
    let testsClasspath = '';
    jarPaths.forEach(function (value) {
        value = value.trim();
        if (
            path.isAbsolute(value) &&
            path.resolve(value) === path.normalize(value) &&
            (sourceControlWorkingFolder === undefined || sourceControlWorkingFolder == '' || !path.resolve(value).startsWith(sourceControlWorkingFolder))
        ) {
            testsClasspath += value;
        } else {
            if (sourceControlWorkingFolder !== undefined && sourceControlWorkingFolder !== '' && path.resolve(value).startsWith(sourceControlWorkingFolder)) {
                value = path.resolve(value).substring(sourceControlWorkingFolder.length, value.length)
            }
            if (
                value.startsWith('./') ||
                value.startsWith('.\\') ||
                value === '.'
            ) {
                if (value.length > 2) {
                    value = value.substring(2);
                } else {
                    value = '';
                }
            }
            testsClasspath += path.join(testWorkingFolder, value);
        }
        if (index > 1) {
            testsClasspath += path.delimiter;
        }
        index--;
    });
    return testsClasspath.toString();
};

const getSeparator = (classPath: string): string => {
    let parseSeparator = ';';
    if (
        !(parseSeparator === path.delimiter) &&
        classPath.includes(path.delimiter)
    ) {
        parseSeparator = path.delimiter;
    }

    return parseSeparator;
};

export { getAbsoluteClasspath };
