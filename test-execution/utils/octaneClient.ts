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
import OctaneListNode from "../model/octane/octaneListNode";
import OctaneTestSuite from "../model/octane/octaneTestSuite";

const properties = PropertiesReader('./octane-details.properties');
const octane = new Octane({
    server: properties.get('octane-url')?.toString() || '',
    sharedSpace: Number.parseInt(
        properties.get('sharedspace')?.toString() || ''
    ),
    workspace: Number.parseInt(properties.get('workspace')?.toString() || ''),
    user: properties.get('user')?.toString() || '',
    password: properties.get('password')?.toString() || ''
});

const getJunitOctaneTestByName = async (
    testName: string
): Promise<OctaneTest> => {
    const query = Query.field('name')
        .equal(testName)
        .and(Query.field('class_name').equal(Query.NULL))
        .and(Query.field('package').equal(Query.NULL))
        .and(Query.field('component').equal(Query.NULL));
    const octaneResponse = await octane
        .get(Octane.entityTypes.tests)
        .fields(
            'name',
            'external_test_id',
            'sc_class_names_udf',
            'sc_method_name_udf',
            'sc_classpath_udf',
            'application_modules',
            'attachments'
        )
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

const getOctaneKDTByName = async (testName: string): Promise<OctaneTest> => {
    const query = Query.field('name')
        .equal(testName)
        .and(Query.field('class_name').equal(Query.NULL))
        .and(Query.field('package').equal(Query.NULL))
        .and(Query.field('component').equal(Query.NULL));
    const octaneResponse = await octane
        .get(Octane.entityTypes.tests)
        .fields('name', 'external_test_id', 'attachments', 'application_modules')
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

const getAppModuleFromIdsBySourceType = async (
    applicationModuleIds: string[],
    sourceType: string
): Promise<OctaneApplicationModule> => {
    const query = Query.field('id')
        .inComparison(applicationModuleIds)
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
            `Entity of type "application_module" with source type_ "${sourceType}" having the id among ids list {${applicationModuleIds}} can not be found in Octane.`
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

const getAttachmentFromIdsByName = async (
    attachmentIds: string[],
    attachmentName: string
): Promise<OctaneAttachment | undefined> => {
    const query = Query.field('id')
        .inComparison(attachmentIds)
        .and(Query.field('name').equal(attachmentName));
    const octaneResponse = await octane
        .get(Octane.entityTypes.attachments)
        .fields('id', 'name')
        .query(query.build())
        .execute();
    return <OctaneAttachment>octaneResponse.data[0];
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
    switch (sourceControlProfile.pluginClass) {
        case 'Git':
            return new GitProfile(
                sourceControlProfile.ProfileName,
                sourceControlProfile.pluginClass,
                sourceControlProfile.RootNode,
                sourceControlProfile.projectpath,
                sourceControlProfile.branch,
                sourceControlProfile.url
            );
        case 'Subversion':
            return new SubversionProfile(
                sourceControlProfile.ProfileName,
                sourceControlProfile.pluginClass,
                sourceControlProfile.RootNode,
                sourceControlProfile.projectpath,
                sourceControlProfile.url
            );
        case 'UNC':
            return new UNCProfile(
                sourceControlProfile.ProfileName,
                sourceControlProfile.pluginClass,
                sourceControlProfile.path,
                sourceControlProfile.RootNode
            );
        case 'VFS':
            return new VFSProfile(
                sourceControlProfile.ProfileName,
                sourceControlProfile.pluginClass,
                sourceControlProfile.RootNode,
                sourceControlProfile.projectpath,
                sourceControlProfile.url
            );
        case 'VoidSCP':
            return undefined;

        default:
            throw new Error(
                `Unknown source control profile of type ` +
                    sourceControlProfile.pluginClass
            );
    }
};

const getNunitOctaneTestByName = async (
    testName: string
): Promise<OctaneTest> => {
    let query;
    query = Query.field('name')
        .equal(testName)
        .and(Query.field('class_name').equal(Query.NULL))
        .and(Query.field('package').equal(Query.NULL))
        .and(Query.field('component').equal(Query.NULL));
    const octaneResponse = await octane
        .get(Octane.entityTypes.tests)
        .fields(
            'name',
            'external_test_id',
            'sc_nunit_assembly_udf',
            'sc_nunit_directory_udf',
            'sc_nunit_options_udf',
            'application_modules',
            'attachments'
        )
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

const getTestSuiteById = async (suiteId: string) : Promise<OctaneTestSuite> => {
    let query;
    query = Query.field("id").equal(suiteId);
    const octaneResponse = await octane
        .get(Octane.entityTypes.testSuites)
        .fields('name',
            'source_id_udf',
            'silk_release_build_udf',
            'silk_release_version_udf',
            'sc_exec_keywords_udf'
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
        silk_release_build_udf: octaneResponse.data[0].silk_release_build_udf ? await extractOctaneListNode(<OctaneListNode>(
            octaneResponse.data[0].silk_release_build_udf
        ), suiteId) : undefined,
        silk_release_version_udf: octaneResponse.data[0].silk_release_version_udf ? await extractOctaneListNode(<OctaneListNode>(
            octaneResponse.data[0].silk_release_version_udf
        ), suiteId) : undefined,
        sc_exec_keywords_udf: octaneResponse.data[0].sc_exec_keywords_udf.data ? await extractOctaneListNodes(<OctaneListNode[]>(
            octaneResponse.data[0].sc_exec_keywords_udf.data
        ), suiteId) : []
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
        .fields("id", "name")
        .query(query.build())
        .execute();
    if (octaneResponse.data === undefined) {
        throw new Error(
            `Not found! Could not get Execution Keywords of Test Suite with id ${suiteId} .`
        );
    }

    return <OctaneListNode[]>(octaneResponse.data);
}

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
    return octaneListNodes.length === 0 ? [] : await getOctaneListNodesFromIds(getOctaneListNodeIds(octaneListNodes), suiteId);
}

const extractOctaneListNode = async (
    octaneListNode: OctaneListNode,
    suiteId: string
): Promise<OctaneListNode | undefined> => {
    let listNode: OctaneListNode[] = [];
    listNode.push(octaneListNode);
    let extractedListNode: OctaneListNode[] = await extractOctaneListNodes(listNode, suiteId);
    return extractedListNode.pop();
}

export {
    getJunitOctaneTestByName,
    validateOctaneTest,
    validateOctaneJUnitTest,
    getNunitOctaneTestByName,
    deserializeSourceControlDetails,
    getApplicationModuleIds,
    getAppModuleFromIdsBySourceType,
    getAttachmentIds,
    getAttachmentFromIdsByName,
    getAttachmentContentById,
    getOctaneKDTByName,
    getTestSuiteById,
};