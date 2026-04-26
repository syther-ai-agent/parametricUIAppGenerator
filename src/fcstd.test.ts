import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectFreeCADModel } from './fcstd';
import type { SidecarConfig } from './types';

const tempDirs: string[] = [];

const createModel = async (documentXml: string) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fcstd-test-'));
  tempDirs.push(tempDir);
  const modelPath = path.join(tempDir, 'widget.FCStd');
  const zip = new JSZip();
  zip.file('Document.xml', documentXml);
  await writeFile(modelPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return modelPath;
};

const documentXml = `
<Document>
  <ObjectData>
    <Object name="Parameters">
      <Properties>
        <Property name="cells" type="Spreadsheet::PropertySheetCells">
          <Cells>
            <Cell address="A1" content="'value" />
            <Cell address="B1" content="'label" />
            <Cell address="C1" content="'description" />
            <Cell address="D1" content="'unit" />
            <Cell address="E1" content="'default" />
            <Cell address="F1" content="'min" />
            <Cell address="G1" content="'max" />
            <Cell address="H1" content="'step" />
            <Cell address="I1" content="'group" />
            <Cell address="J1" content="'options" />
            <Cell address="A2" alias="width_mm" content="42 mm" />
            <Cell address="B2" content="'Width" />
            <Cell address="C2" content="'Overall part width" />
            <Cell address="D2" content="'mm" />
            <Cell address="E2" content="40 mm" />
            <Cell address="F2" content="10 mm" />
            <Cell address="G2" content="120 mm" />
            <Cell address="H2" content="0.5 mm" />
            <Cell address="I2" content="'Dimensions" />
            <Cell address="A3" alias="use_logo" content="true" />
            <Cell address="B3" content="'Use logo" />
            <Cell address="I3" content="'Features" />
            <Cell address="A4" alias="material" content="'pla" />
            <Cell address="B4" content="'Material" />
            <Cell address="I4" content="'Manufacturing" />
            <Cell address="J4" content="'pla,petg,abs" />
            <Cell address="A5" alias="engraving_text" content="'Hello" />
          </Cells>
        </Property>
      </Properties>
    </Object>
  </ObjectData>
</Document>
`;

describe('inspectFreeCADModel', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('discovers aliased spreadsheet cells and infers parameter metadata', async () => {
    const modelPath = await createModel(documentXml);
    const schema = await inspectFreeCADModel(modelPath);

    expect(schema.source.type).toBe('FCStd');
    expect(schema.source.spreadsheetName).toBe('Parameters');
    expect(schema.outputs.preview).toBe('STL');
    expect(schema.outputs.downloads).toEqual(['STL', 'STEP']);
    expect(schema.parameters.map((parameter) => parameter.id)).toEqual([
      'width_mm',
      'use_logo',
      'material',
      'engraving_text'
    ]);

    expect(schema.parameters[0]).toMatchObject({
      id: 'width_mm',
      label: 'Width',
      description: 'Overall part width',
      unit: 'mm',
      type: 'number',
      defaultValue: 40,
      group: 'Dimensions',
      constraints: {
        min: 10,
        max: 120,
        step: 0.5
      }
    });

    expect(schema.parameters[1]).toMatchObject({
      id: 'use_logo',
      type: 'boolean',
      defaultValue: true,
      group: 'Features'
    });

    expect(schema.parameters[2]).toMatchObject({
      id: 'material',
      type: 'enum',
      defaultValue: 'pla',
      group: 'Manufacturing'
    });
    expect(schema.parameters[2].enumOptions?.map((option) => option.value)).toEqual(['pla', 'petg', 'abs']);

    expect(schema.parameters[3]).toMatchObject({
      id: 'engraving_text',
      label: 'Engraving Text',
      type: 'text',
      defaultValue: 'Hello'
    });
  });

  it('merges sidecar overrides without changing discovered ids', async () => {
    const modelPath = await createModel(documentXml);
    const sidecar: SidecarConfig = {
      title: 'Custom Widget',
      parameters: {
        material: {
          label: 'Printable Material',
          order: 0
        },
        engraving_text: {
          hidden: true,
          group: 'Advanced'
        }
      }
    };

    const schema = await inspectFreeCADModel(modelPath, sidecar);

    expect(schema.title).toBe('Custom Widget');
    expect(schema.parameters.map((parameter) => parameter.id)).toContain('material');
    expect(schema.parameters.find((parameter) => parameter.id === 'material')).toMatchObject({
      id: 'material',
      label: 'Printable Material'
    });
    expect(schema.parameters.find((parameter) => parameter.id === 'engraving_text')).toMatchObject({
      id: 'engraving_text',
      hidden: true,
      group: 'Advanced'
    });
  });

  it('falls back to the only spreadsheet when it is not named Parameters', async () => {
    const modelPath = await createModel(
      documentXml.split('name="Parameters"').join('name="Spreadsheet"')
    );

    const schema = await inspectFreeCADModel(modelPath);

    expect(schema.source.spreadsheetName).toBe('Spreadsheet');
    expect(schema.parameters.map((parameter) => parameter.id)).toContain('width_mm');
  });
});
