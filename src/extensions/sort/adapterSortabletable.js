import {Feature} from '../../feature';
import {isArray, isFn, isUndef} from '../../types';
import {createElm, elm, getText, tag} from '../../dom';
import {addEvt} from '../../event';
// import {formatDate} from '../../date';
import {unformat as unformatNb} from '../../number';
import {
    NONE, CELL_TAG, HEADER_TAG, STRING, NUMBER, DATE, FORMATTED_NUMBER,
    FORMATTED_NUMBER_EU, IP_ADDRESS
} from '../../const';

/**
 * SortableTable Adapter module
 */
export default class AdapterSortableTable extends Feature {

    /**
     * Creates an instance of AdapterSortableTable
     * @param {TableFilter} tf TableFilter instance
     * @param {Object} opts Configuration object
     */
    constructor(tf, opts) {
        super(tf, opts.name);

        /**
         * Module name
         * @type {String}
         */
        this.name = opts.name;

        /**
         * Module description
         * @type {String}
         */
        this.desc = opts.description || 'Sortable table';

        /**
         * Indicate whether table previously sorted
         * @type {Boolean}
         * @private
         */
        this.sorted = false;

        /**
         * List of sort type per column basis
         * @type {Array}
         */
        this.sortTypes = isArray(opts.types) ? opts.types : [];

        /**
         * Column to be sorted at initialization, ie:
         * sort_col_at_start: [1, true]
         * @type {Array}
         */
        this.sortColAtStart = isArray(opts.sort_col_at_start) ?
            opts.sort_col_at_start : null;

        /**
         * Enable asynchronous sort, if triggers are external
         * @type {Boolean}
         */
        this.asyncSort = Boolean(opts.async_sort);

        /**
         * List of element IDs triggering sort on a per column basis
         * @type {Array}
         */
        this.triggerIds = isArray(opts.trigger_ids) ? opts.trigger_ids : [];

        // edit .sort-arrow.descending / .sort-arrow.ascending in
        // tablefilter.css to reflect any path change
        /**
         * Path to images
         * @type {String}
         */
        this.imgPath = opts.images_path || tf.themesPath;

        /**
         * Blank image file name
         * @type {String}
         */
        this.imgBlank = opts.image_blank || 'blank.png';

        /**
         * Css class for sort indicator image
         * @type {String}
         */
        this.imgClassName = opts.image_class_name || 'sort-arrow';

        /**
         * Css class for ascending sort indicator image
         * @type {String}
         */
        this.imgAscClassName = opts.image_asc_class_name || 'ascending';

        /**
         * Css class for descending sort indicator image
         * @type {String}
         */
        this.imgDescClassName = opts.image_desc_class_name || 'descending';

        /**
         * Cell attribute key storing custom value used for sorting
         * @type {String}
         */
        this.customKey = opts.custom_key || 'data-tf-sortKey';

        /**
         * Callback fired when sort extension is instanciated
         * @type {Function}
         */
        this.onSortLoaded = isFn(opts.on_sort_loaded) ?
            opts.on_sort_loaded : null;

        /**
         * Callback fired before a table column is sorted
         * @type {Function}
         */
        this.onBeforeSort = isFn(opts.on_before_sort) ?
            opts.on_before_sort : null;

        /**
         * Callback fired after a table column is sorted
         * @type {Function}
         */
        this.onAfterSort = isFn(opts.on_after_sort) ? opts.on_after_sort : null;

        /**
         * SortableTable instance
         * @private
         */
        this.stt = null;

        this.enable();
    }

    /**
     * Initializes AdapterSortableTable instance
     */
    init() {
        if (this.initialized) {
            return;
        }
        let tf = this.tf;
        let adpt = this;

        // SortableTable class sanity check (sortabletable.js)
        if (isUndef(SortableTable)) {
            throw new Error('SortableTable class not found.');
        }

        this.overrideSortableTable();
        this.setSortTypes();

        //Column sort at start
        let sortColAtStart = adpt.sortColAtStart;
        if (sortColAtStart) {
            this.stt.sort(sortColAtStart[0], sortColAtStart[1]);
        }

        if (this.onSortLoaded) {
            this.onSortLoaded.call(null, tf, this);
        }

        /*** SortableTable callbacks ***/
        this.stt.onbeforesort = function () {
            if (adpt.onBeforeSort) {
                adpt.onBeforeSort.call(null, tf, adpt.stt.sortColumn);
            }

            /*** sort behaviour for paging ***/
            if (tf.paging) {
                tf.feature('paging').disable();
            }
        };

        this.stt.onsort = function () {
            adpt.sorted = true;

            //sort behaviour for paging
            if (tf.paging) {
                let paginator = tf.feature('paging');
                // recalculate valid rows index as sorting may have change it
                tf.getValidRows(true);
                paginator.enable();
                paginator.setPage(paginator.getPage());
            }

            if (adpt.onAfterSort) {
                adpt.onAfterSort.call(null, tf, adpt.stt.sortColumn,
                    adpt.stt.descending);
            }

            adpt.emitter.emit('column-sorted', tf, adpt.stt.sortColumn,
                adpt.stt.descending);
        };

        this.emitter.on(['sort'],
            (tf, colIdx, desc) => this.sortByColumnIndex(colIdx, desc));

        /** @inherited */
        this.initialized = true;

        this.emitter.emit('sort-initialized', tf, this);
    }

    /**
     * Sort specified column
     * @param {Number} colIdx Column index
     * @param {Boolean} desc Optional: descending manner
     */
    sortByColumnIndex(colIdx, desc) {
        this.stt.sort(colIdx, desc);
    }

    /**
     * Set SortableTable overrides for TableFilter integration
     */
    overrideSortableTable() {
        let adpt = this,
            tf = this.tf;

        /**
         * Overrides headerOnclick method in order to handle th event
         * @param  {Object} e [description]
         */
        SortableTable.prototype.headerOnclick = function (evt) {
            if (!adpt.initialized) {
                return;
            }

            // find Header element
            let el = evt.target || evt.srcElement;

            while (el.tagName !== CELL_TAG && el.tagName !== HEADER_TAG) {
                el = el.parentNode;
            }

            this.sort(
                SortableTable.msie ?
                    SortableTable.getCellIndex(el) : el.cellIndex
            );
        };

        /**
         * Overrides getCellIndex IE returns wrong cellIndex when columns are
         * hidden
         * @param  {Object} oTd TD element
         * @return {Number}     Cell index
         */
        SortableTable.getCellIndex = function (oTd) {
            let cells = oTd.parentNode.cells,
                l = cells.length, i;
            for (i = 0; cells[i] !== oTd && i < l; i++) { }
            return i;
        };

        /**
         * Overrides initHeader in order to handle filters row position
         * @param  {Array} oSortTypes
         */
        SortableTable.prototype.initHeader = function (oSortTypes) {
            let stt = this;
            if (!stt.tHead) {
                if (tf.gridLayout) {
                    stt.tHead = tf.feature('gridLayout').headTbl.tHead;
                } else {
                    return;
                }
            }

            stt.headersRow = tf.headersRow;
            let cells = stt.tHead.rows[stt.headersRow].cells;
            stt.sortTypes = oSortTypes || [];
            let l = cells.length;
            let img, c;

            for (let i = 0; i < l; i++) {
                c = cells[i];
                if (stt.sortTypes[i] !== null && stt.sortTypes[i] !== 'None') {
                    c.style.cursor = 'pointer';
                    img = createElm('img',
                        ['src', adpt.imgPath + adpt.imgBlank]);
                    c.appendChild(img);
                    if (stt.sortTypes[i] !== null) {
                        c.setAttribute('_sortType', stt.sortTypes[i]);
                    }
                    addEvt(c, 'click', stt._headerOnclick);
                } else {
                    c.setAttribute('_sortType', oSortTypes[i]);
                    c._sortType = 'None';
                }
            }
            stt.updateHeaderArrows();
        };

        /**
         * Overrides updateHeaderArrows in order to handle arrows indicators
         */
        SortableTable.prototype.updateHeaderArrows = function () {
            let stt = this;
            let cells, l, img;

            // external headers
            if (adpt.asyncSort && adpt.triggerIds.length > 0) {
                let triggers = adpt.triggerIds;
                cells = [];
                l = triggers.length;
                for (let j = 0; j < l; j++) {
                    cells.push(elm(triggers[j]));
                }
            } else {
                if (!this.tHead) {
                    return;
                }
                cells = stt.tHead.rows[stt.headersRow].cells;
                l = cells.length;
            }
            for (let i = 0; i < l; i++) {
                let cell = cells[i];
                if (!cell) {
                    continue;
                }
                let cellAttr = cell.getAttribute('_sortType');
                if (cellAttr !== null && cellAttr !== 'None') {
                    img = cell.lastChild || cell;
                    if (img.nodeName.toLowerCase() !== 'img') {
                        img = createElm('img',
                            ['src', adpt.imgPath + adpt.imgBlank]);
                        cell.appendChild(img);
                    }
                    if (i === stt.sortColumn) {
                        img.className = adpt.imgClassName + ' ' +
                            (this.descending ?
                                adpt.imgDescClassName :
                                adpt.imgAscClassName);
                    } else {
                        img.className = adpt.imgClassName;
                    }
                }
            }
        };

        /**
         * Overrides getRowValue for custom key value feature
         * @param  {Object} oRow    Row element
         * @param  {String} sType
         * @param  {Number} nColumn
         * @return {String}
         */
        SortableTable.prototype.getRowValue = function (oRow, sType, nColumn) {
            let stt = this;
            // if we have defined a custom getRowValue use that
            let sortTypeInfo = stt._sortTypeInfo[sType];
            if (sortTypeInfo && sortTypeInfo.getRowValue) {
                return sortTypeInfo.getRowValue(oRow, nColumn);
            }
            let c = oRow.cells[nColumn];
            let s = SortableTable.getInnerText(c);
            return stt.getValueFromString(s, sType);
        };

        /**
         * Overrides getInnerText in order to avoid Firefox unexpected sorting
         * behaviour with untrimmed text elements
         * @param  {Object} oNode DOM element
         * @return {String}       DOM element inner text
         */
        SortableTable.getInnerText = function (oNode) {
            if (!oNode) {
                return;
            }
            if (oNode.getAttribute(adpt.customKey)) {
                return oNode.getAttribute(adpt.customKey);
            } else {
                return getText(oNode);
            }
        };
    }

    /**
     * Adds a sort type
     */
    addSortType() {
        var args = arguments;
        SortableTable.prototype.addSortType(args[0], args[1], args[2], args[3]);
    }

    /**
     * Sets the sort types on a column basis
     * @private
     */
    setSortTypes() {
        let tf = this.tf,
            sortTypes = this.sortTypes,
            _sortTypes = [];

        for (let i = 0; i < tf.nbCells; i++) {
            let colType;

            if (sortTypes[i]) {
                colType = sortTypes[i].toLowerCase();
                if (colType === NONE) {
                    colType = 'None';
                }
            } else { // resolve column types
                if (tf.hasType(i, [NUMBER, FORMATTED_NUMBER,
                    FORMATTED_NUMBER_EU, IP_ADDRESS])) {
                    colType = tf.colTypes[i].toLowerCase();
                // } else if (tf.hasColDateType && tf.colDateType[i] !== null) {
                    // colType = tf.colDateType[i].toLowerCase() + 'date';
                } else if (tf.hasType(i, [DATE])) {
                    let dateType = tf.feature('dateType');
                    let locale = dateType.getOptions(i).locale || tf.locale;
                    colType = `${DATE}-${locale}`;
                    this.addSortType(colType, (dateStr) => {
                        return dateType.parse(dateStr, locale);
                    });
                } else {
                    colType = STRING;
                }
            }
            _sortTypes.push(colType);
        }

        //Public TF method to add sort type

        //Custom sort types
        this.addSortType(NUMBER, Number);
        this.addSortType('caseinsensitivestring', SortableTable.toUpperCase);
        // this.addSortType(DATE, SortableTable.toDate);
        this.addSortType(STRING);
        this.addSortType(FORMATTED_NUMBER, usNumberConverter);
        this.addSortType(FORMATTED_NUMBER_EU, euNumberConverter);
        // this.addSortType('dmydate', dmyDateConverter);
        // this.addSortType('ymddate', ymdDateConverter);
        // this.addSortType('mdydate', mdyDateConverter);
        // this.addSortType('ddmmmyyyydate', ddmmmyyyyDateConverter);
        this.addSortType(IP_ADDRESS, ipAddress, sortIP);

        this.stt = new SortableTable(tf.tbl, _sortTypes);

        /*** external table headers adapter ***/
        if (this.asyncSort && this.triggerIds.length > 0) {
            let triggers = this.triggerIds;
            for (let j = 0; j < triggers.length; j++) {
                if (triggers[j] === null) {
                    continue;
                }
                let trigger = elm(triggers[j]);
                if (trigger) {
                    trigger.style.cursor = 'pointer';

                    addEvt(trigger, 'click', (evt) => {
                        let elm = evt.target;
                        if (!this.tf.sort) {
                            return;
                        }
                        this.stt.asyncSort(triggers.indexOf(elm.id));
                    });
                    trigger.setAttribute('_sortType', _sortTypes[j]);
                }
            }
        }
    }

    /**
     * Remove extension
     */
    destroy() {
        if (!this.initialized) {
            return;
        }
        let tf = this.tf;
        this.emitter.off(['sort'],
            (tf, colIdx, desc) => this.sortByColumnIndex(colIdx, desc));
        this.sorted = false;
        this.initialized = false;
        this.stt.destroy();

        let ids = tf.getFiltersId();
        for (let idx = 0; idx < ids.length; idx++) {
            let header = tf.getHeaderElement(idx);
            let img = tag(header, 'img');

            if (img.length === 1) {
                header.removeChild(img[0]);
            }
        }
        this.initialized = false;
    }

}

//Converters
function usNumberConverter(s) {
    return unformatNb(s, FORMATTED_NUMBER);
}
function euNumberConverter(s) {
    return unformatNb(s, FORMATTED_NUMBER_EU);
}
// function dateConverter(s, format) {
//     return formatDate(s, format);
// }
// function dmyDateConverter(s) {
//     return dateConverter(s, 'DMY');
// }
// function mdyDateConverter(s) {
//     return dateConverter(s, 'MDY');
// }
// function ymdDateConverter(s) {
//     return dateConverter(s, 'YMD');
// }
// function ddmmmyyyyDateConverter(s) {
//     return dateConverter(s, 'DDMMMYYYY');
// }

function ipAddress(value) {
    let vals = value.split('.');
    for (let x in vals) {
        let val = vals[x];
        while (3 > val.length) {
            val = '0' + val;
        }
        vals[x] = val;
    }
    return vals.join('.');
}

function sortIP(a, b) {
    let aa = ipAddress(a.value.toLowerCase());
    let bb = ipAddress(b.value.toLowerCase());
    if (aa === bb) {
        return 0;
    } else if (aa < bb) {
        return -1;
    } else {
        return 1;
    }
}
