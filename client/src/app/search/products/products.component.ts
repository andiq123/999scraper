import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { IProduct } from 'src/app/shared/models/product';
import { SearchService } from '../search.service';

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
})
export class ProductsComponent implements OnInit {
  products!: IProduct[];
  loading: boolean = false;
  constructor(private searchService: SearchService) {}

  ngOnInit(): void {
    // this.loadProducts('iphone');
  }

  onSubmit(form: NgForm) {
    const search = form.value.search;
    if (!search) return;
    this.loadProducts(search);
  }

  loadProducts(searchCriteria: string) {
    this.loading = true;
    this.products = [];
    this.searchService.addSearchCriteriaToFilters(searchCriteria);
    this.searchService.getProducts().subscribe(
      (products: IProduct[]) => {
        this.products = products;
        this.loading = false;
      },
      (e) => {
        console.log(e);
        this.loading = false;
      }
    );
  }
}
