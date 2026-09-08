/** 将可能的 JSON 文本格式化为缩进字符串。 */
export function formatJsonString(str) {
  if (typeof str !== 'string') return str;
  const s = str.trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return str;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return str;
  }
}

/** 从 inputSchema 解析参数定义，保留 enum / items / properties。 */
export function parseParams(tool) {
  const schema = tool.inputSchema || {};
  const props = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(props).map(([name, sch]) => {
    const raw = sch || {};
    let type = raw.type || 'unknown';
    if (Array.isArray(type)) {
      type = type.find((t) => t && t !== 'null') || type[0];
    }
    return {
      name,
      type,
      required: required.includes(name),
      description: raw.description,
      format: raw.format,
      default: raw.default,
      enum: Array.isArray(raw.enum) ? raw.enum : null,
      items: raw.items || null,
      properties: raw.properties || null,
    };
  });
}

/** 参数输入占位文案。 */
export function paramPlaceholder(param) {
  if (param.enum?.length) return param.enum.join(' | ');
  if (param.type === 'object') return '{ }';
  if (param.type === 'array') return '[ ]';
  if (param.type === 'boolean') return 'true | false';
  if (param.type === 'number' || param.type === 'integer') return '0';
  return '';
}

/** 参数说明：描述 + 类型补充信息。 */
export function paramHint(param) {
  const parts = [];
  if (param.description) parts.push(param.description);
  if (param.enum?.length) {
    parts.push(`枚举: ${param.enum.join(', ')}`);
  } else if (param.type === 'object' && param.properties) {
    parts.push(`字段: ${Object.keys(param.properties).join(', ')}`);
  } else if (param.type === 'array' && param.items) {
    parts.push(`元素类型: ${param.items.type || 'object'}`);
  }
  return parts.join(' · ') || null;
}

/** 将表单输入转为工具调用参数值。 */
export function parseInputValue(val, type, param) {
  const t = (type || 'string').toLowerCase();
  if (val === '' || val == null) {
    return t === 'string' ? '' : null;
  }
  if (param?.enum) {
    if (typeof param.enum[0] === 'number') return Number(val);
    return String(val);
  }
  if (t === 'number' || t === 'integer') return Number(val);
  if (t === 'boolean') {
    if (typeof val === 'boolean') return val;
    return val === 'true';
  }
  if (t === 'object' || t === 'array') {
    if (typeof val === 'object') return val;
    return JSON.parse(val);
  }
  return val;
}

/** 将参数值转为表单可展示文本。 */
export function displayParamValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

/** 按 schema 给出参数初始值。 */
export function defaultValueForParam(param) {
  if (param.default !== undefined && param.default !== null) return param.default;
  if (param.enum?.length) return param.enum[0];
  if (param.type === 'boolean') return false;
  if (param.type === 'number' || param.type === 'integer') return null;
  if (param.type === 'object') return {};
  if (param.type === 'array') return [];
  return param.type === 'string' ? '' : null;
}

/** 序列化工具调用响应。 */
export function serializeInvokeResult(res) {
  if (!res) return '';
  if (res.structuredContent != null) {
    return JSON.stringify(res.structuredContent, null, 2);
  }
  const contentPart = (res.content || '').trim();
  return contentPart ? formatJsonString(contentPart) : '(无文本输出)';
}

/** 调用前去掉非必填的空参数。 */
export function filterEmptyOptionalParams(args, params) {
  const filtered = {};
  Object.entries(args || {}).forEach(([key, value]) => {
    const paramDef = params.find((p) => p.name === key);
    if (!paramDef) return;
    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0);
    if (!paramDef.required && isEmpty) return;
    filtered[key] = value;
  });
  return filtered;
}

/** 从文档条目解析参数表格行（工具用 inputSchema，提示词用 arguments_schema）。 */
export function parseDocParams(item) {
  // 提示词的 arguments 可能是数组 schema，优先用 arguments_schema
  if (Array.isArray(item.arguments_schema)) {
    return item.arguments_schema.map((a) => ({
      name: a.name || '',
      type: 'string',
      required: !!a.required,
      description: a.description || '',
    }));
  }
  const schema = item.inputSchema || item.arguments_schema || {};
  if (Array.isArray(schema)) {
    return schema.map((a) => ({
      name: a.name || '',
      type: 'string',
      required: !!a.required,
      description: a.description || '',
    }));
  }
  const props = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(props).map(([pname, sch]) => {
    let type = sch?.type || 'unknown';
    if (Array.isArray(type)) {
      type = type.find((t) => t && t !== 'null') || type[0];
    }
    const enumVals = Array.isArray(sch?.enum) ? sch.enum : null;
    return {
      name: pname,
      type: enumVals ? `enum(${type})` : type,
      required: required.includes(pname),
      description: sch?.description || (enumVals ? `枚举: ${enumVals.join(', ')}` : ''),
    };
  });
}

