import React from 'react';
import { paramPlaceholder, paramHint, displayParamValue } from '../utils';

/** 按 JSON Schema 类型渲染参数输入控件。 */
export function ParamField({ param, value, onChange }) {
  const hint = paramHint(param);
  const labelType = param.enum ? `enum(${param.type || 'string'})` : param.type;

  const label = (
    <label className="param-label">
      {param.name}
      {param.required && <span className="required">*</span>}: {labelType}
    </label>
  );

  if (param.enum?.length) {
    return (
      <div className="form-group">
        {label}
        <select
          className="param-input param-select"
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {!param.required && <option value="">（空）</option>}
          {param.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
        {hint && <div className="param-hint">{hint}</div>}
      </div>
    );
  }

  if (param.type === 'boolean') {
    const strVal = value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : '';
    return (
      <div className="form-group">
        {label}
        <select
          className="param-input param-select"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        >
          {!param.required && <option value="">（空）</option>}
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        {hint && <div className="param-hint">{hint}</div>}
      </div>
    );
  }

  if (param.type === 'number' || param.type === 'integer') {
    return (
      <div className="form-group">
        {label}
        <input
          type="number"
          className="param-input"
          step={param.type === 'integer' ? '1' : 'any'}
          placeholder={paramPlaceholder(param)}
          value={value == null || value === '' ? '' : value}
          onChange={(e) => onChange(e.target.value)}
        />
        {hint && <div className="param-hint">{hint}</div>}
      </div>
    );
  }

  if (param.type === 'object' || param.type === 'array') {
    return (
      <div className="form-group">
        {label}
        <textarea
          className="param-input param-json"
          rows={6}
          placeholder={paramPlaceholder(param)}
          value={displayParamValue(value)}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        {hint && <div className="param-hint">{hint}</div>}
      </div>
    );
  }

  return (
    <div className="form-group">
      {label}
      <input
        type="text"
        className="param-input"
        placeholder={paramPlaceholder(param)}
        value={displayParamValue(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="param-hint">{hint}</div>}
    </div>
  );
}
