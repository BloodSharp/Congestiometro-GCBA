import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { VectorMapComponent } from './vector-map.component';

import { MatButtonModule } from '@angular/material/button';

@NgModule({
  declarations: [VectorMapComponent],
  imports: [CommonModule, MatButtonModule],
  exports: [VectorMapComponent],
})
export class VectorMapModule {}
