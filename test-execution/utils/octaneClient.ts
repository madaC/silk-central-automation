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
import OctaneTest from '../model/octane/octaneTest';
import {Octane, Query} from '@microfocus/alm-octane-js-rest-sdk';
import PropertiesReader from 'properties-reader';
import SourceControlProfile from '../model/silk/sourceControlProfile';
import GitProfile from '../model/silk/gitProfile.js';
import SubversionProfile from '../model/silk/subversionProfile.js';
import UNCProfile from '../model/silk/UNCProfile.js';
import VFSProfile from '../model/silk/VFSProfile.js';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import OctaneAttachment from '../model/octane/octaneAttachment';
import OctaneListNode from '../model/octane/octaneListNode';
import OctaneTestSuite from '../model/octane/octaneTestSuite';
import STWProfile from '../model/silk/STWProfile.js';
import {decrypt} from "./security.js";

const octaneProperties = PropertiesReader('./octane-details.properties');

let decryptedUser;
let decryptedPassword;
if (octaneProperties.get('user') && octaneProperties.get('password')) {
    decryptedUser = decrypt(octaneProperties.get('user')!.toString().substring("ENCR:".length), 'aes192', new Int8Array(16), Buffer.from('migrationSecretKey192bit'))
    decryptedPassword = decrypt(octaneProperties.get('password')!.toString().substring("ENCR:".length), 'aes192', new Int8Array(16), Buffer.from('migrationSecretKey192bit'))
}
const octane = new Octane({
    server: octaneProperties.get('octane-url')?.toString() || '',
    sharedSpace: Number.parseInt(
        octaneProperties.get('sharedspace')?.toString() || ''
    ),
    workspace: Number.parseInt(octaneProperties.get('workspace')?.toString() || ''),
    user: decryptedUser || '',
    password: decryptedPassword || ''
});

const getOctaneTestByName = async (
    testName: string,
    testFields: string[],
    className?: string
): Promise<OctaneTest> => {
    testName = testName
        .replace('"', '\\"')
        .replace('^', '\\^')
        .replace("'", '\\q')
        .replace('{', '\\{')
        .replace('(', '\\(')
        .replace(')', '\\)')
        .replace('[', '\\[')
        .replace('?', '\\?');
    const query = Query.field('name')
        .equal(testName)
        .and(
            Query.field('class_name').equal(
                typeof className === 'undefined' ? Query.NULL : className
            )
        )
        .and(Query.field('package').equal(Query.NULL))
        .and(Query.field('component').equal(Query.NULL));
    const octaneResponse = await octane
        .get(Octane.entityTypes.tests)
        .fields(...testFields)
        .query(query.build())
        .execute();
    if (octaneResponse.data[0] === undefined) {
        throw new Error(
            `Not found! Automated test with name ${testName} does not exist in Octane.`
        );
    }
    return <OctaneTest>{
        ...octaneResponse.data[0],
        attachments: <OctaneAttachment[]>(
            octaneResponse.data[0].attachments.data
        ),
        application_modules: <OctaneApplicationModule[]>(
            octaneResponse.data[0].application_modules.data
        )
    };
};

const getAppModuleBySourceType = async (
    test: OctaneTest,
    sourceType: string
): Promise<OctaneApplicationModule> => {
    if (
        !Array.isArray(test.application_modules) ||
        !test.application_modules.length
    ) {
        throw new Error(
            `Octane test with name ${test.name} does not have any application modules assigned`
        );
    }
    const assignedAppModuleIds = getApplicationModuleIds(
        test.application_modules
    );
    if (assignedAppModuleIds.length == 0) {
        throw new Error(
            `Octane test with name ${test.name} does not have any application modules assigned`
        );
    }
    const query = Query.field('id')
        .inComparison(assignedAppModuleIds)
        .and(Query.field('source_type_udf').equal(sourceType));
    const octaneResponse = await octane
        .get(Octane.entityTypes.applicationModules)
        .fields(
            'id',
            'name',
            'source_type_udf',
            'sc_source_control_udf',
            'sc_product_name_udf',
            'attachments'
        )
        .query(query.build())
        .execute();
    if (octaneResponse.data[0] === undefined) {
        throw new Error(
            `Entity of type "application_module" with source type_ "${sourceType}" having the id among ids list {${assignedAppModuleIds}} can not be found in Octane.`
        );
    }
    return <OctaneApplicationModule>{
        ...octaneResponse.data[0],
        attachments: <OctaneAttachment[]>octaneResponse.data[0].attachments.data
    };
};

const getApplicationModuleIds = (
    assignedApplicationModules: OctaneApplicationModule[]
): string[] => {
    const applicationModuleIds: string[] = [];
    assignedApplicationModules.forEach(appModule => {
        applicationModuleIds.push(appModule.id);
    });
    return applicationModuleIds;
};

const getAttachmentIds = (attachments: OctaneAttachment[]): string[] => {
    const testAttachmentIds: string[] = [];
    attachments.forEach(testAttachment => {
        testAttachmentIds.push(testAttachment.id);
    });
    return testAttachmentIds;
};

const getAttachmentContentByName = async (
    entity: OctaneTest | OctaneTestSuite | OctaneApplicationModule,
    attachmentName: string
): Promise<Buffer | undefined> => {
    if (!Array.isArray(entity.attachments) || !entity.attachments.length) {
        return undefined;
    }

    const attachmentIds: string[] = getAttachmentIds(entity.attachments);
    const query = Query.field('id')
        .inComparison(attachmentIds)
        .and(Query.field('name').equal(attachmentName));
    const octaneResponse = await octane
        .get(Octane.entityTypes.attachments)
        .fields('id', 'name')
        .query(query.build())
        .execute();

    const attachment: OctaneAttachment | undefined = <OctaneAttachment>(
        octaneResponse.data[0]
    );
    if (attachment === undefined) {
        return undefined;
    }

    return await getAttachmentContentById(Number.parseInt(attachment!.id));
};

const getAttachmentContentById = async (
    attachmentId: number
): Promise<Buffer> => {
    return Buffer.from(
        await octane.getAttachmentContent().at(attachmentId).execute()
    );
};

const deserializeSourceControlDetails = (
    name: string
): SourceControlProfile | undefined => {
    const sourceControlProfile = JSON.parse(name);
    switch (sourceControlProfile.Type) {
        case 'Git':
            return new GitProfile(
                sourceControlProfile.id,
                sourceControlProfile.ProfileName,
                sourceControlProfile.Type,
                sourceControlProfile.RootNode,
                sourceControlProfile.projectpath,
                sourceControlProfile.branch,
                sourceControlProfile.url,
                sourceControlProfile.WorkingFolder
            );
        case 'Subversion':
            return new SubversionProfile(
                sourceControlProfile.id,
                sourceControlProfile.ProfileName,
                sourceControlProfile.Type,
                sourceControlProfile.RootNode,
                sourceControlProfile.projectpath,
                sourceControlProfile.url,
                sourceControlProfile.WorkingFolder
            );
        case 'UNC':
            return new UNCProfile(
                sourceControlProfile.id,
                sourceControlProfile.ProfileName,
                sourceControlProfile.Type,
                sourceControlProfile.path,
                sourceControlProfile.RootNode,
                sourceControlProfile.WorkingFolder
            );
        case 'VFS':
            return new VFSProfile(
                sourceControlProfile.id,
                sourceControlProfile.ProfileName,
                sourceControlProfile.Type,
                sourceControlProfile.RootNode,
                sourceControlProfile.projectpath,
                sourceControlProfile.url,
                sourceControlProfile.WorkingFolder
            );
        case 'STW': {
            return new STWProfile(
                sourceControlProfile.id,
                sourceControlProfile.ProfileName,
                sourceControlProfile.Type,
                sourceControlProfile.dbType,
                sourceControlProfile.dbServer,
                sourceControlProfile.dbName,
                sourceControlProfile.dbPort,
                sourceControlProfile.dbSchema
            );
        }
        case 'VoidSCP':
            return undefined;

        default:
            throw new Error(
                `Unknown source control profile of type ` +
                    sourceControlProfile.pluginClass
            );
    }
};

const getTestSuiteById = async (suiteId: string): Promise<OctaneTestSuite> => {
    let query;
    query = Query.field('id').equal(suiteId);
    const octaneResponse = await octane
        .get(Octane.entityTypes.testSuites)
        .fields(
            'name',
            'source_id_udf',
            'silk_release_build_udf',
            'silk_release_version_udf',
            'sc_exec_keywords_udf',
            'attachments'
        )
        .query(query.build())
        .execute();
    if (octaneResponse.data[0] === undefined) {
        throw new Error(
            `Not found! Test Suite with id ${suiteId} does not exist in Octane.`
        );
    }
    return <OctaneTestSuite>{
        ...octaneResponse.data[0],
        silk_release_build_udf: octaneResponse.data[0].silk_release_build_udf
            ? await extractOctaneListNode(
                  <OctaneListNode>octaneResponse.data[0].silk_release_build_udf,
                  suiteId
              )
            : undefined,
        silk_release_version_udf: octaneResponse.data[0]
            .silk_release_version_udf
            ? await extractOctaneListNode(
                  <OctaneListNode>(
                      octaneResponse.data[0].silk_release_version_udf
                  ),
                  suiteId
              )
            : undefined,
        sc_exec_keywords_udf: octaneResponse.data[0].sc_exec_keywords_udf.data
            ? await extractOctaneListNodes(
                  <OctaneListNode[]>(
                      octaneResponse.data[0].sc_exec_keywords_udf.data
                  ),
                  suiteId
              )
            : [],
        attachments: <OctaneAttachment[]>octaneResponse.data[0].attachments.data
    };
};

const getOctaneListNodeIds = (octaneListNodes: OctaneListNode[]): string[] => {
    const octaneListNodeIds: string[] = [];
    octaneListNodes.forEach(octaneListNode => {
        octaneListNodeIds.push(octaneListNode.id);
    });
    return octaneListNodeIds;
};

const getOctaneListNodesFromIds = async (
    octaneListNodeIds: string[],
    suiteId: string
): Promise<OctaneListNode[]> => {
    const query = Query.field('id').inComparison(octaneListNodeIds);
    const octaneResponse = await octane
        .get(Octane.entityTypes.listNodes)
        .fields('id', 'name')
        .query(query.build())
        .execute();
    if (octaneResponse.data === undefined) {
        throw new Error(
            `Not found! Could not get Execution Keywords of Test Suite with id ${suiteId} .`
        );
    }

    return <OctaneListNode[]>octaneResponse.data;
};

const validateOctaneTest = (test: OctaneTest, testName: string): void => {
    if (!test) {
        throw new Error(
            'Could not get Octane automated test with name ' + testName
        );
    }
};

const validateOctaneJUnitTest = (test: OctaneTest, testName: string): void => {
    validateOctaneTest(test, testName);
    if (!test.sc_classpath_udf || test.sc_classpath_udf.length === 0) {
        throw new Error(
            'SC Classpath udf has empty value for Octane automated test of type JUnit with name' +
                testName
        );
    }
};

const extractOctaneListNodes = async (
    octaneListNodes: OctaneListNode[],
    suiteId: string
): Promise<OctaneListNode[]> => {
    return octaneListNodes.length === 0
        ? []
        : await getOctaneListNodesFromIds(
              getOctaneListNodeIds(octaneListNodes),
              suiteId
          );
};

const extractOctaneListNode = async (
    octaneListNode: OctaneListNode,
    suiteId: string
): Promise<OctaneListNode | undefined> => {
    let listNode: OctaneListNode[] = [];
    listNode.push(octaneListNode);
    let extractedListNode: OctaneListNode[] = await extractOctaneListNodes(
        listNode,
        suiteId
    );
    return extractedListNode.pop();
};

export {
    validateOctaneTest,
    validateOctaneJUnitTest,
    deserializeSourceControlDetails,
    getApplicationModuleIds,
    getAppModuleBySourceType,
    getAttachmentIds,
    getAttachmentContentByName,
    getAttachmentContentById,
    getTestSuiteById,
    getOctaneTestByName,
    octaneProperties
};
