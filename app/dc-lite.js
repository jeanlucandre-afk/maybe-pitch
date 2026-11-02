/* dc-lite: a tiny vanilla renderer for the MAYBE design-canvas templates.
   Supports {{path}} holes, <template data-for data-as>, <template data-if>, onX="{{fn}}" handlers,
   and a DCLogic base class with state / setState / forceUpdate. No dependencies. */
(function () {
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true; if (path === 'false') return false; if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/, ANY = /\{\{\s*([^}]+?)\s*\}\}/g;
  function interp(str, scope) { return str.replace(ANY, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); }); }
  function build(nodes, scope, parent) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) { parent.appendChild(document.createTextNode(n.nodeValue.indexOf('{{') < 0 ? n.nodeValue : interp(n.nodeValue, scope))); continue; }
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'TEMPLATE' && n.hasAttribute('data-for')) {
        var list = lookup(n.getAttribute('data-for').replace(/^\{\{|\}\}$/g, ''), scope) || [], as = n.getAttribute('data-as') || 'item';
        for (var j = 0; j < list.length; j++) { var s = Object.create(scope); s[as] = list[j]; s.$index = j; build(n.content.childNodes, s, parent); }
        continue;
      }
      if (n.tagName === 'TEMPLATE' && n.hasAttribute('data-if')) {
        if (lookup(n.getAttribute('data-if').replace(/^\{\{|\}\}$/g, ''), scope)) build(n.content.childNodes, scope, parent);
        continue;
      }
      var el = n.cloneNode(false);
      for (var a = n.attributes.length - 1; a >= 0; a--) {
        var name = n.attributes[a].name, val = n.attributes[a].value;
        if (val.indexOf('{{') < 0) continue;
        var m = WHOLE.exec(val);
        if (/^on[a-z]+$/i.test(name) && m) {
          el.removeAttribute(name);
          var fn = lookup(m[1], scope);
          if (typeof fn === 'function') el.addEventListener(name.slice(2).toLowerCase(), (function (f) { return function (e) { if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault(); f(e); }; })(fn));
          continue;
        }
        var out = m ? lookup(m[1], scope) : interp(val, scope);
        if (out == null || (out === false && name.indexOf('aria-') !== 0)) el.removeAttribute(name);
        else { el.setAttribute(name, out === true && name.indexOf('aria-') !== 0 ? '' : String(out)); if (name === 'value' && 'value' in el) el.value = String(out); }
      }
      if (n.tagName === 'TEMPLATE') { el.content.appendChild(n.content.cloneNode(true)); }
      else build(n.childNodes, scope, el);
      parent.appendChild(el);
    }
  }
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (p) { if (typeof p === 'function') p = p(this.state, this.props); this.state = Object.assign({}, this.state, p); this._schedule(); };
  DCLogic.prototype.forceUpdate = function () { this._schedule(); };
  DCLogic.prototype._schedule = function () { var self = this; if (self._q) return; self._q = true; Promise.resolve().then(function () { self._q = false; self._render(); }); };
  DCLogic.prototype._render = function () {
    var vals = this.renderVals ? this.renderVals() : {};
    var y = window.scrollY, frag = document.createDocumentFragment();
    build(this._tpl.content.childNodes, vals, frag);
    this._root.replaceChildren(frag);
    if (window.scrollY !== y) window.scrollTo(0, y);
  };
  window.DCLogic = DCLogic;
  window.DC = { mount: function (Comp) {
    var c = new Comp({}); c._tpl = document.getElementById('dc-tpl'); c._root = document.getElementById('dc-root');
    c._render(); if (c.componentDidMount) c.componentDidMount();
  } };
  // no-op links inside the mockups
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href="#"]'); if (a) e.preventDefault(); });
})();
