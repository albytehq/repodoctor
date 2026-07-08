/**
 * Fixture plugin for integration tests.
 *
 * This file exports a valid RepoDoctorPlugin with a single scanner
 * that produces a FILE_EXISTS fact for a test file.
 */

import type { RepoDoctorPlugin } from '@repodoctor/plugins/types';

const testPlugin: RepoDoctorPlugin = {
  name: 'test-fixture-plugin',
  version: '1.0.0',
  apiVersion: 1,
  scanners: [
    {
      id: 'fixture-scanner',
      supports: () => true,
      async scan(context) {
        const exists = await context.fs.fileExists('test.txt');
        return [
          {
            type: 'FILE_EXISTS',
            target: 'test.txt',
            value: exists,
          },
        ];
      },
    },
  ],
};

export default testPlugin;
