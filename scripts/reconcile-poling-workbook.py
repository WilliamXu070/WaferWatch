"""Refresh only exact, unambiguous workbook provenance; never guess scientific mappings."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

FIELDS = ['voltage', 'pulseWidthMs', 'pulses', 'postPulseVoltage', 'postPulseWidthMs']
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def column(number):
    result = ''
    while number:
        number, digit = divmod(number - 1, 26)
        result = chr(65 + digit) + result
    return result


def column_number(label):
    result = 0
    for character in label:
        result = result * 26 + ord(character) - 64
    return result


def read_observations(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(t.text or '' for t in item.findall('.//s:t', NS))
                      for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        cells = {}
        for cell in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//s:c', NS):
            value = cell.find('s:v', NS)
            value = value.text if value is not None else ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
            if cell.get('t') == 's' and value:
                value = shared[int(value)]
            if value:
                cells[cell.get('r')] = value
    observations = []
    for address, specimen in cells.items():
        if not re.fullmatch(r'TF[AB]\d+(?:\.\d+)?M\d+R\d+', specimen):
            continue
        match = re.fullmatch(r'([A-Z]+)(\d+)', address)
        base, row = column_number(match[1]), int(match[2])
        if not cells.get(column(base) + str(row + 3), '').lower().startswith('voltage'):
            continue
        for index in range(base + 1, base + 18):
            die_cell = column(index) + str(row + 1)
            die = cells.get(die_cell, '')
            if not re.fullmatch(r'R\d+C\d+', die):
                continue
            field_cells = {field: column(index) + str(row + offset)
                           for field, offset in zip(FIELDS, [3, 4, 5, 6, 7])}
            try:
                values = {field: float(cells[cell]) for field, cell in field_cells.items()}
            except (ValueError, KeyError):
                continue
            observations.append({
                'specimen': specimen, 'die': die, 'headerCell': address, 'dieCell': die_cell,
                'fieldCells': field_cells, **values,
                'round': next((cells[column(i) + str(row)] for i in range(base + 1, base + 18)
                               if 'ROUND' in cells.get(column(i) + str(row), '').upper()), None)
            })
    return observations


def reconcile(catalog, observations, file_name, digest):
    decisions = []
    for record in catalog['records']:
        if not record['imagePath']:
            continue
        candidates = [observation for observation in observations
                      if observation['specimen'] == record['specimenReference']
                      and observation['die'] == record['dieLabel']]
        exact = [candidate for candidate in candidates if all(candidate[field] == record[field] for field in FIELDS)]
        held = record['confidence'] != 'direct' or len(exact) != 1
        decisions.append({'id': record['id'], 'specimen': record['specimenReference'], 'die': record['dieLabel'],
                          'sourceFile': record['sourceFile'], 'slide': record['slide'],
                          'old': {field: record[field] for field in FIELDS}, 'existingFlags': record['flags'],
                          'decision': 'hold' if held else 'exact-match', 'candidates': candidates,
                          'reason': 'Existing source conflict or reconciliation requires review' if record['confidence'] != 'direct'
                          else 'No single exact match in latest workbook' if len(exact) != 1 else None})
        if held:
            continue
        observation = exact[0]
        source_key = f"{file_name}::Sheet1::{observation['headerCell']}::{observation['dieCell']}"
        previous_source = record['parameterSource']
        previous_provenance = record['workbookProvenance']
        if previous_source.get('fileName') == file_name:
            previous_source = previous_source.get('previousSource')
            previous_provenance = previous_provenance.get('previousProvenance')
        record['parameterSource'] = {'kind': 'workbook', 'fileName': file_name, 'sourceKey': source_key,
                                     'sha256': digest, 'reconciliation': 'exact-match', 'previousSource': previous_source}
        record['workbookProvenance'] = {
            'sourceKey': source_key, 'sheet': 'Sheet1', 'blockHeaderCell': observation['headerCell'],
            'sourceSpecimenReference': observation['specimen'], 'sourceDieLabel': observation['die'],
            'dieLabelCell': observation['dieCell'], 'fieldCells': observation['fieldCells'],
            'round': observation['round'], 'previousProvenance': previous_provenance
        }
    return decisions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workbook', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--review-file', type=Path, required=True)
    parser.add_argument('--apply', action='store_true', help='Write the local catalog only; never writes the database')
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text())
    before = {record['id']: {field: record.get(field) for field in [*FIELDS, 'specimenReference', 'dieLabel', 'imagePath', 'imageSha256']}
              for record in catalog['records']}
    observations = read_observations(args.workbook)
    digest = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
    decisions = reconcile(catalog, observations, args.workbook.name, digest)
    for record in catalog['records']:
        assert before[record['id']] == {field: record.get(field) for field in before[record['id']]}, 'Scientific fields changed'
    args.review_file.write_text(json.dumps({'workbookSha256': digest, 'observations': observations, 'decisions': decisions}, indent=2))
    if args.apply:
        source = {'fileName': args.workbook.name, 'sha256': digest, 'kind': 'workbook'}
        catalog['sourceFiles'] = [item for item in catalog['sourceFiles'] if item['fileName'] != args.workbook.name] + [source]
        catalog['generatedAt'] = '2026-11-09T00:00:00Z'
        catalog['workbookReconciliation'] = {
            'fileName': args.workbook.name, 'sha256': digest, 'matchedImageRecords': sum(d['decision'] == 'exact-match' for d in decisions),
            'heldImageRecords': sum(d['decision'] == 'hold' for d in decisions),
            'policy': 'Only exact unambiguous provenance updated. Held mappings retain all existing values and provenance. Workbook-only records retained in storage, excluded from the microscopy map.'
        }
        payload = {key: catalog[key] for key in ['schemaVersion', 'sourceFiles', 'records']}
        catalog['manifestSha256'] = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()
        args.catalog.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'mode': 'local-catalog' if args.apply else 'review-only', 'observations': len(observations),
                      'decisions': dict(collections.Counter(d['decision'] for d in decisions))}))


if __name__ == '__main__':
    main()
