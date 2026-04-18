#!/usr/bin/env python3
import json, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'rel': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pkgrel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}

def col_to_num(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n

def cell_ref_to_rc(ref):
    m = re.match(r'([A-Z]+)(\d+)', ref)
    if not m:
        return (0,0)
    return (int(m.group(2)), col_to_num(m.group(1)))

def text_from_inline(c):
    is_node = c.find('main:is', NS)
    if is_node is None:
        return ''
    parts = []
    for t in is_node.findall('.//main:t', NS):
        parts.append(t.text or '')
    return ''.join(parts)


def read_xlsx(path):
    with zipfile.ZipFile(path, 'r') as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('main:si', NS):
                parts = [t.text or '' for t in si.findall('.//main:t', NS)]
                shared.append(''.join(parts))

        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel_map = {}
        for rel in rels.findall('pkgrel:Relationship', NS):
            rel_map[rel.attrib.get('Id')] = rel.attrib.get('Target')

        sheets = []
        for sh in wb.findall('main:sheets/main:sheet', NS):
            name = sh.attrib.get('name', '')
            rid = sh.attrib.get('{%s}id' % NS['rel'])
            target = rel_map.get(rid, '')
            if not target:
                continue
            if not target.startswith('worksheets/'):
                target = 'worksheets/' + target.split('/')[-1]
            xml_path = 'xl/' + target
            if xml_path not in z.namelist():
                continue
            root = ET.fromstring(z.read(xml_path))
            cells = []
            max_r = 0
            max_c = 0
            for c in root.findall('.//main:sheetData/main:row/main:c', NS):
                ref = c.attrib.get('r', '')
                r, col = cell_ref_to_rc(ref)
                if r <= 0 or col <= 0:
                    continue
                t = c.attrib.get('t')
                v = ''
                if t == 'inlineStr':
                    v = text_from_inline(c)
                else:
                    v_node = c.find('main:v', NS)
                    raw = (v_node.text if v_node is not None else '') or ''
                    if t == 's':
                        try:
                            idx = int(raw)
                            v = shared[idx] if 0 <= idx < len(shared) else ''
                        except:
                            v = ''
                    elif t == 'b':
                        v = 'TRUE' if raw == '1' else 'FALSE'
                    else:
                        v = raw
                cells.append({'r': r, 'c': col, 'v': v})
                max_r = max(max_r, r)
                max_c = max(max_c, col)

            merges = []
            for mc in root.findall('.//main:mergeCells/main:mergeCell', NS):
                ref = mc.attrib.get('ref', '')
                if ':' not in ref:
                    continue
                a,b = ref.split(':', 1)
                r1,c1 = cell_ref_to_rc(a)
                r2,c2 = cell_ref_to_rc(b)
                merges.append({'r1':r1,'c1':c1,'r2':r2,'c2':c2})

            sheets.append({'name': name, 'maxRow': max_r, 'maxCol': max_c, 'cells': cells, 'merges': merges})

        return {'sheets': sheets}

if __name__ == '__main__':
    data = read_xlsx(sys.argv[1])
    print(json.dumps(data, ensure_ascii=False))
