import {Model} from "../../model"
import * as p from "core/properties"
import {Selection} from "../selections/selection"
import {Indices} from "core/types"
import {Filter} from "../filters/filter"
import {ColumnarDataSource} from "./columnar_data_source"

export namespace CDSView {
  export type Attrs = p.AttrsOf<Props>

  export type Props = Model.Props & {
    filters: p.Property<Filter[]>
    source: p.Property<ColumnarDataSource>
    indices: p.Property<Indices>
    indices_map: p.Property<{[key: string]: number}>
    masked: p.Property<Indices | null>
  }
}

export interface CDSView extends CDSView.Attrs {}

export class CDSView extends Model {
  properties: CDSView.Props

  constructor(attrs?: Partial<CDSView.Attrs>) {
    super(attrs)
  }

  static init_CDSView(): void {
    this.define<CDSView.Props>({
      filters: [ p.Array, [] ],
      source:  [ p.Instance  ],
    })

    this.internal({
      indices:     [ p.Any       ],
      indices_map: [ p.Any, {}   ],
      masked:      [ p.Any, null ],
    })
  }

  initialize(): void {
    super.initialize()
    this.compute_indices()
  }

  connect_signals(): void {
    super.connect_signals()

    this.connect(this.properties.filters.change, () => {
      this.compute_indices()
      this.change.emit()
    })

    const connect_listeners = () => {
      const fn = () => this.compute_indices()

      if (this.source != null) {
        this.connect(this.source.change, fn)

        if (this.source instanceof ColumnarDataSource) {
          this.connect(this.source.streaming, fn)
          this.connect(this.source.patching, fn)
        }
      }
    }

    let initialized = this.source != null

    if (initialized)
      connect_listeners()
    else {
      this.connect(this.properties.source.change, () => {
        if (!initialized) {
          connect_listeners()
          initialized = true
        }
      })
    }
  }

  compute_indices(): void {
    const {source} = this
    if (source == null)
      return

    // XXX: if the data source is empty, there still may be one
    // index originating from glyph's scalar values.
    const size = source.get_length() ?? 1
    const indices = Indices.all_set(size)

    for (const filter of this.filters) {
      indices.intersect(filter.compute_indices(source))
    }

    this.indices = indices
    this._indices = [...indices]
    this.indices_map_to_subset()
  }

  private _indices: number[]

  indices_map_to_subset(): void {
    this.indices_map = {}
    for (let i = 0; i < this._indices.length; i++){
      this.indices_map[this._indices[i]] = i
    }
  }

  convert_selection_from_subset(selection_subset: Selection): Selection {
    const selection_full = new Selection({
      indices: selection_subset.indices.map((i) => this._indices[i]),
      line_indices: selection_subset.line_indices,
      multiline_indices: selection_subset.multiline_indices,
      selected_glyphs: selection_subset.selected_glyphs,
      view: selection_subset.view,
    })
    return selection_full
  }

  convert_selection_to_subset(selection_full: Selection): Selection {
    const selection_subset = new Selection({
      indices: selection_full.indices.map((i) => this.indices_map[i]),
      line_indices: selection_full.line_indices,
      multiline_indices: selection_full.multiline_indices,
      selected_glyphs: selection_full.selected_glyphs,
      view: selection_full.view,
    })
    return selection_subset
  }

  convert_indices_from_subset(indices: number[]): number[] {
    return indices.map((i) => this._indices[i])
  }
}
