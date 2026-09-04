/**
 * Parser for GTM `.tpl` files.
 *
 * A `.tpl` file is a flat text file split into sections delimited by lines that
 * consist solely of `___SECTION_NAME___`. This helper slices it back into a
 * `{ SECTION_NAME: rawText }` map so the tests can operate on the real artefact
 * that ships to the Gallery rather than on a copy that could drift.
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'template.tpl');

const SECTION_DELIMITER = /^___([A-Z0-9_]+)___$/;

function parseSections(source) {
  const sections = {};
  const order = [];
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current !== null) {
      sections[current] = buffer.join('\n').trim();
    }
  };

  source.split(/\r?\n/).forEach(line => {
    const match = SECTION_DELIMITER.exec(line.trim());
    if (match) {
      flush();
      current = match[1];
      order.push(current);
      buffer = [];
      return;
    }
    if (current !== null) {
      buffer.push(line);
    }
  });
  flush();

  return { sections, order };
}

function readTemplate(templatePath = TEMPLATE_PATH) {
  // GTM exports `.tpl` files with a UTF-8 BOM; it would otherwise glue itself
  // to the first section delimiter.
  const source = fs.readFileSync(templatePath, 'utf8').replace(/^﻿/, '');
  const { sections, order } = parseSections(source);
  return { source, sections, order };
}

function requireSection(sections, name) {
  if (!Object.prototype.hasOwnProperty.call(sections, name)) {
    throw new Error(`template.tpl is missing the ___${name}___ section`);
  }
  return sections[name];
}

function getSandboxedCode(templatePath) {
  const { sections } = readTemplate(templatePath);
  return requireSection(sections, 'SANDBOXED_JS_FOR_WEB_TEMPLATE');
}

function getTemplateParameters(templatePath) {
  const { sections } = readTemplate(templatePath);
  return JSON.parse(requireSection(sections, 'TEMPLATE_PARAMETERS'));
}

function getWebPermissions(templatePath) {
  const { sections } = readTemplate(templatePath);
  return JSON.parse(requireSection(sections, 'WEB_PERMISSIONS'));
}

function getInfo(templatePath) {
  const { sections } = readTemplate(templatePath);
  return JSON.parse(requireSection(sections, 'INFO'));
}

module.exports = {
  TEMPLATE_PATH,
  readTemplate,
  parseSections,
  getSandboxedCode,
  getTemplateParameters,
  getWebPermissions,
  getInfo,
};
