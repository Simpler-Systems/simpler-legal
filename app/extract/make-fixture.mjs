// Builds fixture.docx — a REAL Word package (the OOXML namespaces, a full [Content_Types].xml,
// every relationship resolving) with text planted in every hiding spot the walker must list
// and the .docx writer must clear. Rewritten 2026-09-13 (Step 4): the first fixture used fake
// namespaces and was never a package Word would open; the real-document trial (26 govuk files,
// 14 LibreOffice stress files) then found the shapes that matter — runs split mid-word, tabs
// and breaks inside runs, table cells, field codes, hyperlink tooltips and external targets,
// content-control plumbing, legacy form fields, document variables, people.xml, chart caches
// (with a float artefact), SmartArt text, AlternateContent twins, thumbnails, macros — and
// each of them is planted here. Zip writer: stored entries only, which is a valid package.
//
//   node app/extract/make-fixture.mjs      → app/extract/fixture.docx
import fs from 'node:fs';

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function zipStored(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content);
    const nameB = Buffer.from(name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// ── the real namespaces ──────────────────────────────────────────────────────
const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  dgm: 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  dsp: 'http://schemas.microsoft.com/office/drawing/2008/diagram',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  v: 'urn:schemas-microsoft-com:vml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  dcmitype: 'http://purl.org/dc/dcmitype/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  ep: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  cust: 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties',
  vt: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
  ds: 'http://schemas.openxmlformats.org/officeDocument/2006/customXml',
  pr: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};
const REL = (t) => `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${t}`;
const PKG = (t) => `http://schemas.openxmlformats.org/package/2006/relationships/metadata/${t}`;
const CT = (t) => `application/vnd.openxmlformats-officedocument.wordprocessingml.${t}+xml`;
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const xmlns = (...keys) => keys.map((k) => `xmlns:${k}="${NS[k]}"`).join(' ');
const W = xmlns('w', 'r');

// ── the body ─────────────────────────────────────────────────────────────────
// Every tracked insertion outside the body keeps its channel (audit B5, 2026-09-12).
// The run opens with a space: runs of a paragraph concatenate as they stand, so without it
// "Intraco" + "HEADER-INS" is the one word "IntracoHEADER-INS" — which no whole-word table
// matches, in this test or in Word.
const INS = (marker, text) => `<w:ins w:id="9" w:author="Priya Nair" w:date="2026-09-03T10:00:00Z"><w:r><w:t xml:space="preserve"> ${marker}: ${text}</w:t></w:r></w:ins>`;

const documentXml = `${XML}<w:document ${xmlns('w', 'r', 'wp', 'a', 'pic', 'c', 'dgm', 'mc', 'wps', 'v')} mc:Ignorable="wps">
<w:body>
<w:p><w:r><w:t xml:space="preserve">SERVICE AGREEMENT between Hastings Holdings Ltd and Marg</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>aret Tan.</w:t></w:r></w:p>
<w:p>
<w:r><w:t xml:space="preserve">The parties agree as follows. </w:t></w:r>
<w:del w:id="1" w:author="Opposing Counsel" w:date="2026-09-01T10:00:00Z"><w:r><w:delText>SECRET-DELETED: SSN 123-45-6789 belongs to Lim Wei Sheng.</w:delText></w:r></w:del>
<w:ins w:id="2" w:author="Janet Kwon" w:date="2026-09-02T10:00:00Z"><w:r><w:t>INSERTED-BY-TRACKING: notify Intraco Corporation.</w:t></w:r></w:ins>
</w:p>
<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN-VANISH-TEXT: client codename Acme Bakery.</w:t></w:r></w:p>
<w:p><w:r><w:t>Ref</w:t></w:r><w:r><w:tab/><w:t>M-2026-0141</w:t><w:br/><w:t>Second line by Ravi Pillai</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>TABLE-CELL: Counsel</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>TABLE-CELL: Nadia Rahman</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p>
<w:commentRangeStart w:id="0"/>
<w:r><w:t xml:space="preserve">Contact: </w:t></w:r>
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> HYPERLINK "mailto:FIELD-MAILTO.margaret.tan@hastings.example" </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>Email Margaret Tan</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r><w:commentReference w:id="0"/></w:r>
<w:r><w:t xml:space="preserve"> or </w:t></w:r>
<w:hyperlink r:id="rIdLink" w:tooltip="TOOLTIP: Bob Trenholm's private line +65 9123 4567"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>our website</w:t></w:r></w:hyperlink>
<w:r><w:t xml:space="preserve">; merge </w:t></w:r>
<w:fldSimple w:instr=" MERGEFIELD FIELD-MERGE-ClientSSN "><w:r><w:t>«ClientSSN»</w:t></w:r></w:fldSimple>
<w:r><w:footnoteReference w:id="1"/></w:r>
<w:r><w:endnoteReference w:id="1"/></w:r>
</w:p>
<w:p>
<w:sdt><w:sdtPr><w:alias w:val="CONTROL-ALIAS: Signatory"/><w:tag w:val="CONTROL-TAG: signer-lim-wei-sheng"/><w:id w:val="12345"/><w:dropDownList><w:listItem w:displayText="CONTROL-ITEM: Lim Wei Sheng" w:value="lws"/><w:listItem w:displayText="CONTROL-ITEM: Priya Nair" w:value="pn"/></w:dropDownList></w:sdtPr><w:sdtContent><w:r><w:t>CONTROL-CONTENT: Lim Wei Sheng</w:t></w:r></w:sdtContent></w:sdt>
</w:p>
<w:p>
<w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="Dropdown1"/><w:enabled/><w:calcOnExit w:val="0"/><w:ddList><w:listEntry w:val="LEGACY-ENTRY: Farah Osman"/><w:listEntry w:val="LEGACY-ENTRY: Kwame Mensah"/></w:ddList></w:ffData></w:fldChar></w:r>
<w:r><w:instrText xml:space="preserve"> FORMDROPDOWN </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>Farah Osman</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>
<w:p>
<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Picture 1" descr="ALTTEXT: photo of John Naismith at 80 Raffles Place"/><a:graphic><a:graphicData uri="${NS.pic}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>
<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1828800" cy="457200"/><wp:docPr id="3" name="Text Box 3"/><a:graphic><a:graphicData uri="${NS.wps}"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>TEXTBOX-TEXT: call +65 6438 2210</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape id="Text Box 3" style="width:144pt;height:36pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>TEXTBOX-TEXT: call +65 6438 2210</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>
<w:r><w:t xml:space="preserve"> after the box</w:t></w:r>
</w:p>
<w:p>
<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="4572000" cy="2743200"/><wp:docPr id="2" name="Chart 2" descr="ALTTEXT-CHART: revenue chart prepared by Tomas Berglund"/><a:graphic><a:graphicData uri="${NS.c}"><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>
</w:p>
<w:p>
<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="4572000" cy="2743200"/><wp:docPr id="4" name="Diagram 4"/><a:graphic><a:graphicData uri="${NS.dgm}"><dgm:relIds r:dm="rIdDgmData" r:lo="rIdDgmLo" r:qs="rIdDgmQs" r:cs="rIdDgmCs"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>
</w:p>
<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;

const header1 = `${XML}<w:hdr ${W}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t>HEADER-TEXT: Matter 2026-0141 · Hastings v. Intraco</w:t></w:r>${INS('HEADER-INS', 'draft reviewed by Tomas Berglund')}</w:p></w:hdr>`;
const footer1 = `${XML}<w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t>FOOTER-TEXT: privileged and confidential — Hifn Inc. NRIC S1234567A</w:t></w:r>${INS('FOOTER-INS', 'copy to Anand Krishnan')}</w:p></w:ftr>`;
const footnotes = `${XML}<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> FOOTNOTE-TEXT: see deposition of Rosa Delgado.</w:t></w:r>${INS('FOOTNOTE-INS', 'also the affidavit of Mei Ling Chua')}</w:p></w:footnote></w:footnotes>`;
const endnotes = `${XML}<w:endnotes ${W}><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote><w:endnote w:id="1"><w:p><w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr><w:r><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> ENDNOTE-TEXT: exhibit list held by Farah Osman.</w:t></w:r>${INS('ENDNOTE-INS', 'exhibit 7 was added by Kwame Mensah')}</w:p></w:endnote></w:endnotes>`;
const glossary = `${XML}<w:glossaryDocument ${W}><w:docParts><w:docPart><w:docPartPr><w:name w:val="Signature block"/><w:category><w:name w:val="General"/><w:gallery w:val="placeholder"/></w:category></w:docPartPr><w:docPartBody><w:p><w:r><w:t>GLOSSARY-TEXT: building block — Dana Whitlock signature line.</w:t></w:r>${INS('GLOSSARY-INS', 'phone 9123 4567 for Dana')}</w:p></w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`;
const comments = `${XML}<w:comments ${W}><w:comment w:id="0" w:author="Janet Kwon" w:date="2026-09-02T11:00:00Z" w:initials="JK"><w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:annotationRef/></w:r><w:r><w:t>COMMENT-TEXT: cut this — it names Bob Trenholm directly.</w:t></w:r></w:p></w:comment></w:comments>`;
const people = `${XML}<w15:people ${xmlns('w15')}><w15:person w15:author="PEOPLE: Janet Kwon"><w15:presenceInfo w15:providerId="AD" w15:userId="PEOPLE-ID: S::janet.kwon@hifn.example::0000"/></w15:person></w15:people>`;
const settings = `${XML}<w:settings ${W}><w:zoom w:percent="100"/><w:trackRevisions/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:docVars><w:docVar w:name="ClientRef" w:val="DOCVAR: Hifn Inc — DMS 44-8812"/></w:docVars><w:rsids><w:rsidRoot w:val="00A1B2C3"/></w:rsids><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
const styles = `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/></w:style><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/></w:style><w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/></w:style><w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/></w:style></w:styles>`;

// a chart: title and category labels are text; the value cache is doubles, one of them a
// float artefact (4.4 stored as 4.4000000000000004) and one a number that places (a phone-
// shaped value) — the writer must leave the first alone and zero the second
const chart1 = `${XML}<c:chartSpace ${xmlns('c', 'a', 'r')}><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:rPr lang="en-GB"/><a:t>CHART-TITLE: revenue by client — Intraco</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>CHART-SERIES: Hastings Holdings revenue</c:v></c:pt></c:strCache></c:strRef></c:tx><c:invertIfNegative val="0"/><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>CHART-CAT: Intraco</c:v></c:pt><c:pt idx="1"><c:v>CHART-CAT: Acme Bakery</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>4.4000000000000004</c:v></c:pt><c:pt idx="1"><c:v>91234567</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="150"/><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart><c:externalData r:id="rIdXlsx"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
const chart1Rels = `${XML}<Relationships xmlns="${NS.pr}"><Relationship Id="rIdXlsx" Type="${REL('package')}" Target="../embeddings/Microsoft_Excel_Worksheet.xlsx"/></Relationships>`;

// SmartArt: the data model and the drawing both carry the text; layout, style and colours are structure
const dgmData = `${XML}<dgm:dataModel ${xmlns('dgm', 'a')}><dgm:ptLst><dgm:pt modelId="{00000000-0000-0000-0000-000000000001}" type="doc"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-GB"/></a:p></dgm:t></dgm:pt><dgm:pt modelId="{00000000-0000-0000-0000-000000000002}"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB"/><a:t>DIAGRAM-TEXT: Rosa Delgado reports to Mei Ling Chua</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="{00000000-0000-0000-0000-000000000003}" srcId="{00000000-0000-0000-0000-000000000001}" destId="{00000000-0000-0000-0000-000000000002}" srcOrd="0" destOrd="0" parTransId="{00000000-0000-0000-0000-000000000004}" sibTransId="{00000000-0000-0000-0000-000000000005}"/></dgm:cxnLst><dgm:bg/><dgm:whole/></dgm:dataModel>`;
const dgmDrawing = `${XML}<dsp:drawing ${xmlns('dsp', 'a')}><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/><dsp:sp modelId="{00000000-0000-0000-0000-000000000002}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></dsp:spPr><dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB"/><a:t>DIAGRAM-DRAWING: Rosa Delgado</a:t></a:r></a:p></dsp:txBody></dsp:sp></dsp:spTree></dsp:drawing>`;
const dgmLayout = `${XML}<dgm:layoutDef ${xmlns('dgm', 'a')} uniqueId="urn:microsoft.com/office/officeart/2005/8/layout/default"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="list" pri="400"/></dgm:catLst><dgm:sampData><dgm:dataModel><dgm:ptLst><dgm:pt modelId="0" type="doc"/></dgm:ptLst><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:sampData><dgm:styleData><dgm:dataModel><dgm:ptLst><dgm:pt modelId="0" type="doc"/></dgm:ptLst><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:styleData><dgm:clrData><dgm:dataModel><dgm:ptLst><dgm:pt modelId="0" type="doc"/></dgm:ptLst><dgm:bg/><dgm:whole/></dgm:dataModel></dgm:clrData><dgm:layoutNode name="diagram"><dgm:varLst><dgm:dir/><dgm:resizeHandles val="exact"/></dgm:varLst><dgm:alg type="snake"/><dgm:shape/><dgm:presOf/><dgm:forEach name="nodesForEach" axis="ch" ptType="node"><dgm:layoutNode name="node"><dgm:alg type="tx"/><dgm:shape type="rect"/><dgm:presOf axis="desOrSelf" ptType="node"/><dgm:constrLst><dgm:constr type="h" refType="w"/></dgm:constrLst></dgm:layoutNode></dgm:forEach></dgm:layoutNode></dgm:layoutDef>`;
const dgmQuickStyle = `${XML}<dgm:styleDef ${xmlns('dgm', 'a')} uniqueId="urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="simple" pri="10100"/></dgm:catLst><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:styleLbl name="node0"><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:sp3d/><dgm:txPr/><dgm:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></dgm:style></dgm:styleLbl></dgm:styleDef>`;
const dgmColors = `${XML}<dgm:colorsDef ${xmlns('dgm', 'a')} uniqueId="urn:microsoft.com/office/officeart/2005/8/colors/accent1_2"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="accent1" pri="11200"/></dgm:catLst><dgm:styleLbl name="node0"><dgm:fillClrLst meth="repeat"><a:schemeClr val="accent1"/></dgm:fillClrLst><dgm:linClrLst meth="repeat"><a:schemeClr val="lt1"/></dgm:linClrLst><dgm:effectClrLst/><dgm:txLinClrLst/><dgm:txFillClrLst/><dgm:txEffectClrLst/></dgm:styleLbl></dgm:colorsDef>`;

const core = `${XML}<cp:coreProperties ${xmlns('cp', 'dc', 'dcterms', 'dcmitype', 'xsi')}><dc:title>PROPS-TITLE: Hastings v. Intraco — draft 3</dc:title><dc:creator>PROPS-AUTHOR: dwesterfield</dc:creator><cp:lastModifiedBy>PROPS-LASTMOD: j.reyes@hifn.example</cp:lastModifiedBy><cp:revision>3</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">2026-09-01T09:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-09-13T09:00:00Z</dcterms:modified></cp:coreProperties>`;
// a character count that reads as a phone number (stress file 12, 2026-09-13)
const app = `${XML}<Properties xmlns="${NS.ep}" ${xmlns('vt')}><Application>Microsoft Office Word</Application><Company>PROPS-COMPANY: Hifn Incorporated</Company><Manager>PROPS-MANAGER: Bob Trenholm</Manager><Words>1234</Words><Characters>91234567</Characters><DocSecurity>0</DocSecurity><HyperlinksChanged>false</HyperlinksChanged></Properties>`;
const custom = `${XML}<Properties xmlns="${NS.cust}" ${xmlns('vt')}><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="ClientName"><vt:lpwstr>CUSTOMPROP: Hifn</vt:lpwstr></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="MatterNumber"><vt:lpwstr>CUSTOMPROP: M-2026-0141</vt:lpwstr></property></Properties>`;
// a custom XML data store (SharePoint / DMS metadata lives here) — its own channel, captured whole
const customXml = `${XML}<matter xmlns="http://hifn.example/dms"><client>CUSTOMXML: Hifn Inc — relationship partner Bob Trenholm</client><ref>CUSTOMXML: DMS 44-8812</ref></matter>`;
const customXmlProps = `${XML}<ds:datastoreItem ${xmlns('ds')} ds:itemID="{7A1F0C2E-0000-4000-8000-000000000001}"><ds:schemaRefs/></ds:datastoreItem>`;
const customXmlRels = `${XML}<Relationships xmlns="${NS.pr}"><Relationship Id="rId1" Type="${REL('customXmlProps')}" Target="itemProps1.xml"/></Relationships>`;

const contentTypes = `${XML}<Types xmlns="${NS.ct}">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>
<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>
<Override PartName="/word/header1.xml" ContentType="${CT('header')}"/>
<Override PartName="/word/footer1.xml" ContentType="${CT('footer')}"/>
<Override PartName="/word/footnotes.xml" ContentType="${CT('footnotes')}"/>
<Override PartName="/word/endnotes.xml" ContentType="${CT('endnotes')}"/>
<Override PartName="/word/comments.xml" ContentType="${CT('comments')}"/>
<Override PartName="/word/styles.xml" ContentType="${CT('styles')}"/>
<Override PartName="/word/settings.xml" ContentType="${CT('settings')}"/>
<Override PartName="/word/people.xml" ContentType="${CT('people')}"/>
<Override PartName="/word/glossary/document.xml" ContentType="${CT('document.glossary')}"/>
<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/word/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/>
<Override PartName="/word/diagrams/layout1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"/>
<Override PartName="/word/diagrams/quickStyle1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml"/>
<Override PartName="/word/diagrams/colors1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml"/>
<Override PartName="/word/diagrams/drawing1.xml" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>
</Types>`;
const rootRels = `${XML}<Relationships xmlns="${NS.pr}"><Relationship Id="rId1" Type="${REL('officeDocument')}" Target="word/document.xml"/><Relationship Id="rId2" Type="${PKG('core-properties')}" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL('extended-properties')}" Target="docProps/app.xml"/><Relationship Id="rId4" Type="${REL('custom-properties')}" Target="docProps/custom.xml"/><Relationship Id="rId5" Type="${PKG('thumbnail')}" Target="docProps/thumbnail.jpeg"/></Relationships>`;
const documentRels = `${XML}<Relationships xmlns="${NS.pr}">
<Relationship Id="rIdStyles" Type="${REL('styles')}" Target="styles.xml"/>
<Relationship Id="rIdSettings" Type="${REL('settings')}" Target="settings.xml"/>
<Relationship Id="rIdHdr" Type="${REL('header')}" Target="header1.xml"/>
<Relationship Id="rIdFtr" Type="${REL('footer')}" Target="footer1.xml"/>
<Relationship Id="rIdFn" Type="${REL('footnotes')}" Target="footnotes.xml"/>
<Relationship Id="rIdEn" Type="${REL('endnotes')}" Target="endnotes.xml"/>
<Relationship Id="rIdComments" Type="${REL('comments')}" Target="comments.xml"/>
<Relationship Id="rIdPeople" Type="http://schemas.microsoft.com/office/2011/relationships/people" Target="people.xml"/>
<Relationship Id="rIdGlossary" Type="${REL('glossaryDocument')}" Target="glossary/document.xml"/>
<Relationship Id="rIdImg" Type="${REL('image')}" Target="media/image1.png"/>
<Relationship Id="rIdChart" Type="${REL('chart')}" Target="charts/chart1.xml"/>
<Relationship Id="rIdDgmData" Type="${REL('diagramData')}" Target="diagrams/data1.xml"/>
<Relationship Id="rIdDgmLo" Type="${REL('diagramLayout')}" Target="diagrams/layout1.xml"/>
<Relationship Id="rIdDgmQs" Type="${REL('diagramQuickStyle')}" Target="diagrams/quickStyle1.xml"/>
<Relationship Id="rIdDgmCs" Type="${REL('diagramColors')}" Target="diagrams/colors1.xml"/>
<Relationship Id="rIdDgmDr" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="diagrams/drawing1.xml"/>
<Relationship Id="rIdCx" Type="${REL('customXml')}" Target="../customXml/item1.xml"/>
<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>
<Relationship Id="rIdLink" Type="${REL('hyperlink')}" Target="https://LINK-TARGET.example/bob-trenholm" TargetMode="External"/>
</Relationships>`;

const PARTS = [
  ['[Content_Types].xml', contentTypes],
  ['_rels/.rels', rootRels],
  ['word/_rels/document.xml.rels', documentRels],
  ['word/document.xml', documentXml],
  ['word/header1.xml', header1],
  ['word/footer1.xml', footer1],
  ['word/footnotes.xml', footnotes],
  ['word/endnotes.xml', endnotes],
  ['word/comments.xml', comments],
  ['word/people.xml', people],
  ['word/glossary/document.xml', glossary],
  ['word/styles.xml', styles],
  ['word/settings.xml', settings],
  ['word/charts/chart1.xml', chart1],
  ['word/charts/_rels/chart1.xml.rels', chart1Rels],
  ['word/diagrams/data1.xml', dgmData],
  ['word/diagrams/layout1.xml', dgmLayout],
  ['word/diagrams/quickStyle1.xml', dgmQuickStyle],
  ['word/diagrams/colors1.xml', dgmColors],
  ['word/diagrams/drawing1.xml', dgmDrawing],
  ['docProps/core.xml', core],
  ['docProps/app.xml', app],
  ['docProps/custom.xml', custom],
  ['customXml/item1.xml', customXml],
  ['customXml/itemProps1.xml', customXmlProps],
  ['customXml/_rels/item1.xml.rels', customXmlRels],
  // binaries: a macro project, an embedded workbook (the chart's source data), a picture, a thumbnail
  ['word/vbaProject.bin', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])],
  ['word/embeddings/Microsoft_Excel_Worksheet.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
  ['word/media/image1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
  ['docProps/thumbnail.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0xff, 0xd9])],
];

const docx = zipStored(PARTS);
fs.writeFileSync(new URL('./fixture.docx', import.meta.url), docx);
console.log(`fixture.docx written · ${docx.length} bytes · ${PARTS.length} parts`);
