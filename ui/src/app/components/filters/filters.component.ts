import { Component, Input, OnInit } from '@angular/core';
import { MediaObserver } from 'ngx-flexible-layout';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';

import { BehaviorSubject, combineLatest, firstValueFrom, merge, Observable, of, Subscription, timer } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import { Feature, Map as OlMap, View } from 'ol';
import { OSM } from 'ol/source';
import { defaults as defaultInteractions, Draw } from 'ol/interaction';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { LineString, Polygon, MultiPolygon, Point } from 'ol/geom';
import { Fill, Stroke, Style } from 'ol/style';

// Extraer definición manualmente del siguiente import debido a que falla la importación:
// import GeometryType from 'ol/geom/GeometryType';
enum GeometryType {
  POINT = 'Point',
  LINE_STRING = 'LineString',
  LINEAR_RING = 'LinearRing',
  POLYGON = 'Polygon',
  MULTI_POINT = 'MultiPoint',
  MULTI_LINE_STRING = 'MultiLineString',
  MULTI_POLYGON = 'MultiPolygon',
  GEOMETRY_COLLECTION = 'GeometryCollection',
  CIRCLE = 'Circle',
}

import {
  booleanContains,
  point as turfPoint,
  polygon as turfPolygon,
  multiPolygon as turfMultiPolygon,
  geometry,
} from '@turf/turf';
import booleanIntersects from '@turf/boolean-intersects';

import { saveAs } from 'file-saver';

import { DataService } from 'src/app/services/data.service';
import { DisplayLogService } from 'src/app/services/display-log.service';
import { AdminLevel } from 'src/app/services/indexedDb';
import { charts, ChartType, aggFuncs, hours, metrics } from 'src/app/services/chartTypes';
import { normalizeString } from 'src/app/services/utils';
import { Coordinate } from 'ol/coordinate';
import { DrawEvent } from 'ol/interaction/Draw';
import { MapOptions } from 'ol/Map';

export const getTurfFeature = (polygon: Polygon | MultiPolygon) => {
  return polygon instanceof Polygon
    ? turfPolygon(polygon.getCoordinates())
    : turfMultiPolygon(polygon.getCoordinates());
};

@Component({
  selector: 'app-filters',
  templateUrl: './filters.component.html',
  styleUrls: ['./filters.component.scss'],
})
export class FiltersComponent implements OnInit {
  @Input() exportableData!: Observable<{ csvData: any[]; chart: (typeof charts)[number] }>;
  @Input() secondary = false;

  constructor(
    private router: Router,
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
    private displayLogService: DisplayLogService,
    private media: MediaObserver,
  ) {}

  private mapOptions: MapOptions = {};
  private setupMapOptions(mapOptions: MapOptions) {
    this.mapOptions = mapOptions;
    this.map = new OlMap(this.mapOptions);
    this.map.addInteraction(this.draw);
  }

  public maxDate = timer(0, 1000 * 60 * 60).pipe(map(() => new Date()));
  public charts = charts;
  public metrics = metrics;
  public aggFuncs = aggFuncs;
  public hours = hours;
  public hoursIds = hours.map((h) => h.value);
  /**
   * @type {Observable<{label: string, neighborhoods: AdminLevel[], neighborhoodIds: number[]}[]>} All the data
   * related to the districts area and their neighborhoods.
   */
  public groupedNeighborhoods = this.dataService.neighborhoods.pipe(
    map((neighborhoods) =>
      (neighborhoods || [])
        .sort((a, b) => (a.greaterAdminLevelId > b.greaterAdminLevelId ? 1 : -1))
        .reduce(
          (prev, nei) => {
            const index = prev.findIndex((p) => p.label === nei.greaterAdminLevelName);
            if (index >= 0) {
              prev[index].neighborhoods.push(nei);
              prev[index].neighborhoodIds.push(nei.lowerAdminLevelId);
            } else {
              prev.push({
                label: nei.greaterAdminLevelName,
                neighborhoods: [nei],
                neighborhoodIds: [nei.lowerAdminLevelId],
              });
            }
            return prev;
          },
          [] as { label: string; neighborhoods: (typeof neighborhoods)[number][]; neighborhoodIds: number[] }[],
        ),
    ),
  );

  public show = new BehaviorSubject(false);
  private forceShow = this.dataService.queryParams.pipe(
    take(1),
    map((queryParams) => !this.secondary && !queryParams),
  );
  public show$ = merge(this.show, this.forceShow);
  private drawnPolygon = new VectorSource({ features: [] });
  public draw = new Draw({ source: this.drawnPolygon, type: GeometryType.POLYGON });
  public mapPolygon = new BehaviorSubject<[number, number][]>([]);

  public map!: OlMap;
  private subscriptions: Subscription[] = [];

  /**
   * Updates the data source using the current state, the synchronization parameters, the other state parameters
   * as well the neighborhoods.
   * @returns Returns the updated data source including the current filter options.
   */
  private updateData() {
    return combineLatest([this.dataService.urlParams, this.dataService.streets]).pipe(
      map(([v, streets]) => ({ v: this.secondary ? v.right : v.left, streets })),
      map(({ v, streets }) => {
        if (v.state.mapPolygon) this.mapPolygon.next(v.state.mapPolygon);
        if (v.state.streets) {
          this.selectedStreets.clear();
          for (const { id, name } of (v.state.streets as number[]).map((id) => streets[id])) {
            this.selectedStreets.set(id, name);
          }
        }
        return v;
      }),
      withLatestFrom(this.dataService.neighborhoods),
      map(([{ syncParams, state, otherState }, neighborhoods]) => ({
        syncParams,
        otherState,
        neighborhoodsIds: (neighborhoods || []).map((n) => n.lowerAdminLevelId),
        form: new FormGroup({
          // TODO: default date now
          dateStart: new FormControl(state.dateStart ? new Date(state.dateStart) : new Date(2022, 0, 1)),
          dateEnd: new FormControl(state.dateEnd ? new Date(state.dateEnd) : new Date(2022, 1, 25)),
          hours: new FormControl(state.hours ? state.hours : [17, 18]),
          neighborhoods: new FormControl(state.neighborhoods ? state.neighborhoods : []),
          metric: new FormControl(state.metric || metrics[0].id),
          aggFunc: new FormControl(state.aggFunc || aggFuncs[0].id),
          workingDays: new FormControl(state.workingDays || '{1,0}'),
          autoSelectStreets: new FormControl(state.autoSelectStreets),
          autoSelectAvenues: new FormControl(state.autoSelectAvenues),
        }),
      })),
      shareReplay(1),
    );
  }

  public data = this.updateData();

  /**
   * Gets the selected streets by the filter properties and geographic area specified by the map polygon.
   * @returns {Observable<Street[]>} Return the selected streets by the filter properties and geographic area
   * specified by the map polygon.
   */
  public geoFilteredStreets = combineLatest([
    this.mapPolygon.pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      tap((coords) => {
        this.drawnPolygon.clear();
        const feature = new Feature({ geometry: new LineString(coords.map((c) => fromLonLat(c))) });
        feature.setStyle(
          new Style({
            stroke: new Stroke({ color: '#0099ff', width: 4 }),
            fill: new Fill({ color: '#60bfff' }),
          }),
        );
        this.drawnPolygon.addFeature(feature as never);
      }),
      startWith([]),
    ),
    this.data.pipe(
      switchMap(({ form }) =>
        form.controls.neighborhoods.valueChanges.pipe(startWith(form.controls.neighborhoods.value)),
      ),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    ) as Observable<number[] | null>,
    this.dataService.neighborhoods,
    this.dataService.streets,
    this.dataService.lines,
  ]).pipe(
    switchMap(([coordinates, selectedNeighborhoodIds, neighborhoods, streets, lines]) => {
      if (coordinates.length === 0 && (selectedNeighborhoodIds?.length === 0 || selectedNeighborhoodIds === null))
        return of(Object.values(streets));

      const selectedNeighborhoods = neighborhoods.filter(
        (n) => selectedNeighborhoodIds?.some((id) => id === n.lowerAdminLevelId),
      );

      if (selectedNeighborhoods.length > 0 && coordinates.length > 0) {
        const turfMapPolygon = getTurfFeature(new Polygon([coordinates]));
        const intersected = selectedNeighborhoods.some((n) => booleanIntersects(n.turfPolygon, turfMapPolygon));
        if (!intersected) {
          this.displayLogService.openLogError(
            'La selección del mapa y los barrios no se superponen, debes filtrar correctamente',
          );
          this.selectedStreets.clear();
          return of([]);
        }
      }

      let linesIds: number[];
      if (selectedNeighborhoods.length > 0) {
        const allSelectedIds = selectedNeighborhoods.map(({ linesIds }) => linesIds).flat();
        linesIds = Array.from(new Set<number>(allSelectedIds).values());
      } else {
        linesIds = Object.keys(lines).map(Number);
      }

      if (coordinates.length > 0) {
        const polygon = getTurfFeature(new Polygon([coordinates]));
        linesIds = linesIds
          .map((lineId) => lines[lineId])
          // .filter((s) => booleanContains(polygon, s.turfLine))
          .filter((s) => s?.coordinates.some((point) => booleanContains(polygon, turfPoint(point))))
          .map((l) => l?.id);
      }

      const streetIds = linesIds?.map((lineId) => lines[lineId])?.map((data) => data?.streetId);
      const filteredStreetIds =
        streetIds !== undefined && streetIds !== null && streetIds?.length > 0
          ? Array.from(new Set<number>(streetIds).values())
          : [];
      const filteredStreets = filteredStreetIds?.map((streetId) => streets[streetId]);

      return this.data.pipe(map((data) => data['form'])).pipe(
        switchMap((form) =>
          combineLatest([
            form.controls.autoSelectStreets.valueChanges.pipe(startWith(form.value.autoSelectStreets)),
            form.controls.autoSelectAvenues.valueChanges.pipe(startWith(form.value.autoSelectAvenues)),
          ]).pipe(
            map(
              ([autoSelectStreets, autoSelectAvenues]: [
                boolean | null | undefined,
                boolean | null | undefined,
              ]) => {
                if (autoSelectStreets || autoSelectAvenues) {
                  this.selectedStreets.clear();
                  const selectedStreets = filteredStreets.filter(
                    (street) =>
                      (autoSelectAvenues && street?.type > 1) || (autoSelectStreets && street?.type === 1),
                  );
                  for (const street of selectedStreets) {
                    this.selectedStreets.set(street.id, street.name);
                  }
                }
                return filteredStreets;
              },
            ),
          ),
        ),
      );
    }),
    shareReplay(1),
  );

  public streetSearch = new FormControl('');

  /**
   * @type {Observable<Street[]>} Returns the selected streets from the current filter.
   */
  public filteredStreets = combineLatest([
    this.streetSearch.valueChanges.pipe(
      filter((v) => typeof v === 'string'),
      map((search) => normalizeString(search || '')),
      startWith(''),
    ),
    this.geoFilteredStreets,
  ]).pipe(
    map(([search, streets]) => {
      if (search.length <= 3) return [];
      const filteredStreets = streets.filter((currentStreet) =>
        currentStreet?.name?.length > 0 ? normalizeString(currentStreet?.name).includes(search) : false,
      );
      const sorted = filteredStreets.sort((a, b) => (a.name > b.name ? 1 : -1));
      return sorted;
    }),
  );

  public selectedStreets = new Map<number, string>();

  /**
   * Clear all the selected streets and disable the streets and avenues automatic selection toggles.
   */
  clearAllSelectedStreetsAndDisableToggles() {
    // Verificar cual de ambos filtros estamos utilizando actualmente
    const sidePanelFilter = this.secondary ? 'right' : 'left';
    // Establecemos la selección en los parámetros de la URL con valores
    // falsos para evitar seleccionar automáticamente la próxima vez
    this.dataService.urlParams.forEach((params) => {
      //if (params[sidePanelFilter].state?.streets?.length > 0)
      params[sidePanelFilter].state.streets = [];
      params[sidePanelFilter].state.autoSelectAvenues = false;
      params[sidePanelFilter].state.autoSelectStreets = false;
    });
    // Establecemos el estado de los 'toggles' a falso según corresponda
    this.data.forEach((v) => {
      v?.form?.controls?.autoSelectAvenues?.setValue(false);
      v?.form?.controls?.autoSelectStreets?.setValue(false);
    });
    // Eliminamos las calles seleccionadas
    this.selectedStreets.clear();
  }

  private getCoordinatesArray(drawEvent: DrawEvent): [number, number][] {
    const coordinates = (drawEvent.feature.getGeometry() as LineString)?.getCoordinates();
    let coordinatesArray: [number, number][] = [];
    coordinates?.forEach((coords) => {
      coords?.forEach((point: any) => {
        const coordinatePoints = toLonLat(point);
        const pointObject = { x: Number(coordinatePoints[0] || null), y: Number(coordinatePoints[1] || null) };
        if (Number.isNaN(pointObject.x) || Number.isNaN(pointObject.y)) return;
        coordinatesArray.push([pointObject.x, pointObject.y]);
      });
    });
    return coordinatesArray;
  }

  /**
   * Initializes the map with the given coordinates and zoom level.
   * @param {Coordinate | undefined} previousCenter Sets the center of the map, if not specified the default
   * coordinate will be Buenos Aires city coordinates (Longitude -58.453 and latitude -34.62)
   * @param {number | undefined} previousZoom Sets the zoom level of the map, if not specified the default
   * value will be 12.1
   */
  private async initializeMapContext(previousCenter: Coordinate | undefined, previousZoom: number | undefined) {
    if (this.subscriptions.length > 0) return;
    this.draw.on('drawend', (drawEvent: DrawEvent) => {
      this.mapPolygon?.next(this.getCoordinatesArray(drawEvent));
    });
    this.subscriptions.push(
      ...[
        this.dataService.ready
          .pipe(
            take(1),
            switchMap(() => this.show$),
            filter((s) => s),
            debounceTime(100),
            take(1),
          )
          .subscribe(() => {
            this.setupMapOptions({
              interactions: defaultInteractions(),
              target: `${this.secondary ? 'r' : 'l'}-filter-map`,
              layers: [
                new TileLayer({ source: new OSM(), preload: 4 }),
                new VectorLayer({ source: this.drawnPolygon }),
              ],
              view: new View({
                center: previousCenter === undefined ? fromLonLat([-58.453, -34.62]) : previousCenter,
                zoom: previousZoom === undefined ? 12.1 : previousZoom,
              }),
              controls: [],
            });
          }),
        this.media
          .asObservable()
          .pipe(
            map(() => this.media.isActive('lt-lg')),
            distinctUntilChanged(),
            debounceTime(100),
          )
          .subscribe(() => (this.map ? this.map.updateSize() : null)),
      ],
    );
  }

  /**
   * Initializes the map context and rendering listener function.
   */
  async ngOnInit() {
    // Reinicia por completo el contexto del mapa del filtro
    const drawListeners = this.draw.getListeners('drawend');
    const previousCenter = undefined; // TODO: Ver porque falla esto luego => this.map?.getView().getCenter();
    const previousZoom = undefined; // TODO: Ver porque falla esto luego => this.map?.getView().getZoom();
    if (drawListeners !== undefined && drawListeners !== null && drawListeners.length > 0) {
      drawListeners?.forEach((listener) => this.draw.removeEventListener('drawend', listener));
    }
    if (this.subscriptions.length > 0) {
      this.subscriptions.map((s) => s.unsubscribe());
      this.subscriptions.splice(0, this.subscriptions.length);
    }
    if (!!this.map) {
      this.map.dispose();
    }
    this.initializeMapContext(previousCenter, previousZoom);
  }

  /**
   * Sets the current chart type filter
   * @param {ChartType} newType A string type value with the following values:
   * - **map**: The chart type should display a map with jams information.
   * - **bar**: The chart type should display a bar chart, showcase information about the specific time information.
   * - **line**: The chart type should display a line chart, showcase information about the specific streets information between the current year and the previous one.
   * - **line-with-map**: The chart type should display a line chart as well a map, the data should contain the actual data and the predicted data by the IA.
   * @returns {Promise<boolean>} A promise that resolves to true if the navigation was successful, otherwise returns false.
   */
  public changeChartType(newType: ChartType) {
    return this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { [`${this.secondary ? 'r' : 'l'}-chart`]: newType },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Copy the other filter state to the current state.
   * @param otherState The current state which is being updated from the other state.
   * @returns {Promise<boolean>} A promise that resolves to true if the navigation was successful, otherwise returns false.
   */
  public clone(otherState: any) {
    return this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { [this.secondary ? 'right' : 'left']: JSON.stringify(otherState) },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * The apply function button action which will assign and update the data and page.
   * @param state The current state which is being updated.
   * @param sync The syncrhonous data to be applied to the other state.
   * @param otherState The other state data.
   * @param {[number, number][]} mapPolygon The map polygon coordinates array which contains the latitude and
   * longitude for every point in the map.
   * @returns {Promise<boolean>} A promise that resolves to true if the navigation was successful, otherwise returns false.
   */
  public apply(state: any, sync: any, otherState: any, mapPolygon: [number, number][]) {
    this.show.next(false);
    const completeState = {
      ...state,
      ...Object.fromEntries(Object.entries(otherState).filter(([key]) => sync[key])),
    };
    const queryParams = {
      [this.secondary ? 'right' : 'left']: JSON.stringify({
        ...completeState,
        dateStart: new Date(completeState.dateStart).getTime(),
        dateEnd: completeState.dateEnd ? new Date(completeState.dateEnd).getTime() : undefined,
        streets: sync.streets ? otherState.streets : [...this.selectedStreets.keys()],
        mapPolygon,
      }),
      [this.secondary ? 'right-sync' : 'left-sync']: JSON.stringify(sync),
    };
    return this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Returns a boolean value indicating whether all the city neighborhoods are selected.
   * @param {number[]} selectedNeighborhoods The selected neighborhoods array selection by id.
   * @param {AdminLevel[]} allNeighborhoods All the neighborhood from the city.
   * @returns {boolean} Returns a boolean value indicating whether all the neighboorhoods are selected.
   */
  public allSelected(selectedNeighborhoods: number[], allNeighborhoods: AdminLevel[]) {
    return allNeighborhoods.every((neighborhood) =>
      selectedNeighborhoods.includes(neighborhood.lowerAdminLevelId),
    );
  }

  /**
   * Returns a boolean value indicated wheter at least 1 or more neighborhoods are selected.
   * @param {number[]} selectedNeighborhoods The selected neighborhoods array selection by id.
   * @param {AdminLevel[]} allNeighborhoods All the neighborhood from the city.
   * @returns {boolean} Returns a boolean value indicating whether at least 1 or more neighboorhoods are selected.
   */
  public someSelected(selectedNeighborhoods: number[], allNeighborhoods: AdminLevel[]) {
    return (
      !this.allSelected(selectedNeighborhoods, allNeighborhoods) &&
      allNeighborhoods.some((neighborhood) => selectedNeighborhoods.includes(neighborhood.lowerAdminLevelId))
    );
  }

  /**
   * Sets the neighborhood selection by the specified checkboxes at the neighborhood list or their districts.
   * @param {AbstractControl} control The control to set the active neighborhood selection.
   * @param {boolean} select The boolean value indicating whether the neighborhood is being selected or not.
   * @param {number[]} selectedNeighborhoods The selected neighborhood by the specified city's identifier.
   * @param {number[]} neighborhoodIds The neighborhoods range by their city's identifiers.
   */
  public setSelectedNeighborhoods(
    control: AbstractControl,
    select: boolean,
    selectedNeighborhoods: number[],
    neighborhoodIds: number[],
  ) {
    let newNeighborhoods: typeof selectedNeighborhoods = [];
    if (select) {
      newNeighborhoods = [...selectedNeighborhoods, ...neighborhoodIds].filter(
        (id, index, arr) => arr.findIndex((id2) => id2 === id) === index,
      );
    } else {
      newNeighborhoods = selectedNeighborhoods.filter((id) => !neighborhoodIds.some((id2) => id2 === id));
    }
    control.setValue(newNeighborhoods);
  }

  /**
   * Download the filter selection data as a csv (Comma-separated Values) file.
   * @param {{csvData: any[], chart: (typeof charts)[number]}} param0 The data to be downloaded.
   * @see FiltersComponent.exportableData
   */
  public download({ csvData, chart }: { csvData: any[]; chart: (typeof charts)[number] }) {
    const headers = (Object.keys(csvData[0]) as (keyof (typeof csvData)[0])[]).filter((h) => h !== '__typename');
    const csv = [
      headers.join(','),
      ...csvData.map((row) => headers.map((fieldName) => row[fieldName]).join(',')),
    ].join('\r\n');

    saveAs(new Blob([csv], { type: 'text/csv' }), `${chart.name.toLocaleLowerCase()}.csv`);
  }

  /**
   * Destroy the map subcriptions context to release memory resources.
   */
  public ngOnDestroy() {
    this.subscriptions.map((s) => s.unsubscribe());
  }
}
