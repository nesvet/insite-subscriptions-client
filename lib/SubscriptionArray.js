import { removeOne } from "@nesvet/n";
import { Subscription } from "./Subscription";
import {
	clearSymbol,
	getAsInitialUpdatedSymbol,
	getAsUpdatesSymbol,
	getHandleUpdateSymbol,
	getSubscriptionSymbol,
	renewSymbol,
	setHandleUpdateSymbol,
	subscribeSymbol,
	unsubscribeSymbol,
	updateSymbol
} from "./symbols";


const ascSort = (a, b) => a > b ? 1 : a < b ? -1 : 0;
const descSort = (a, b) => a > b ? -1 : a < b ? 1 : 0;


export class SubscriptionArray extends Array {
	constructor(updates, onUpdate) {
		super();
		
		this.handleUpdate = onUpdate;
		
		if (Array.isArray(updates))
			this.update(updates);
		
	}
	
	sortDirection = 0;
	
	sortCompareFunction = null;
	
	[getHandleUpdateSymbol]() {
		return this.handleUpdate;
	}
	
	[setHandleUpdateSymbol](handleUpdate) {
		return (this.handleUpdate = handleUpdate);
	}
	
	update(updates) {
		
		const updated = [];
		updated.deleted = [];
		updated.added = [];
		
		if (updates) {
			let shouldSort = false;
			
			for (const update of updates)
				switch (update?.[0]) {
					case "i"/* initial */: {
						const [ , array, sort ] = update;
						
						if (sort) {
							this.sortDirection = sort;
							this.sortCompareFunction = sort > 0 ? ascSort : descSort;
							shouldSort = true;
						} else {
							this.sortDirection = 0;
							this.sortCompareFunction = null;
						}
						
						this.length = 0;
						
						for (const newItem of array) {
							this.push(newItem);
							updated.push(newItem);
							updated.added.push(newItem);
						}
						
						break;
					}
					
					case "a"/* add */: {
						const newItem = update[1];
						
						if (!this.includes(newItem)) {
							this.push(newItem);
							if (this.sortDirection)
								shouldSort = true;
							updated.push(newItem);
							updated.added.push(newItem);
						}
						
						break;
					}
					
					case "d"/* delete */: {
						const itemToDelete = update[1];
						
						if (removeOne(this, itemToDelete))
							updated.deleted.push(itemToDelete);
						
						break;
					}
					
					default:
						this.clear();
				}
			
			if (shouldSort)
				this.sort(this.sortCompareFunction);
			
		} else
			this.clear();
		
		this.handleUpdate?.(this, updated, updates?.[0] && updates);
		
		return this;
	}
	
	[updateSymbol] = this.update;
	
	getAsUpdates() {
		return (
			(this.length || this.sortDirection) ?
				[ [ "i"/* initial */, [ ...this ], this.sortDirection ] ] :
				null
		);
	}
	
	[getAsUpdatesSymbol] = this.getAsUpdates;
	
	getAsInitialUpdated() {
		return Object.assign([ ...this.sorted ], {
			added: [ ...this.sorted ],
			deleted: []
		});
	}
	
	[getAsInitialUpdatedSymbol] = this.getAsInitialUpdated;
	
	clear() {
		
		this.length = 0;
		this.sortDirection = 0;
		this.sortCompareFunction = null;
		
	}
	
	[clearSymbol] = this.clear;
	
	valueOf() {
		return this;
	}
	
	get [Symbol.toStringTag]() {
		return "SubscriptionArray";
	}
	
	
	static updateSymbol = updateSymbol;
	static getHandleUpdateSymbol = getHandleUpdateSymbol;
	static setHandleUpdateSymbol = setHandleUpdateSymbol;
	static getAsUpdatesSymbol = getAsUpdatesSymbol;
	static getAsInitialUpdatedSymbol = getAsInitialUpdatedSymbol;
	static clearSymbol = clearSymbol;
	
}


SubscriptionArray.WithSubscription = class SubscriptionArrayWithSubscription extends SubscriptionArray {
	constructor(publicationName, params, onUpdate, immediately = true) {
		super(null, onUpdate);
		
		this.publicationName = publicationName;
		this.params = params;
		
		if (immediately)
			this.subscribe();
		
	}
	
	subscription = null;
	
	subscribe() {
		
		if (!this.subscription)
			this.subscription = new Subscription("array", this.publicationName, this.params, updates => this.update(updates));
		
	}
	
	get [subscribeSymbol]() {
		return this.subscribe;
	}
	
	unsubscribe() {
		
		if (this.subscription) {
			this.subscription.cancel();
			this.subscription = null;
		}
		
	}
	
	get [unsubscribeSymbol]() {
		return this.unsubscribe;
	}
	
	renew(publicationName, params) {
		
		if (this.subscription) {
			this.unsubscribe();
			
			if (publicationName)
				if (Array.isArray(publicationName))
					params = publicationName;
				else
					this.publicationName = publicationName;
			
			if (params)
				this.params = params;
			
			this.subscribe();
		}
		
	}
	
	get [renewSymbol]() {
		return this.renew;
	}
	
	[getSubscriptionSymbol]() {
		return this.subscription;
	}
	
	get [Symbol.toStringTag]() {
		return "SubscriptionArrayWithSubscription";
	}
	
	
	static subscribeSymbol = subscribeSymbol;
	static unsubscribeSymbol = unsubscribeSymbol;
	static renewSymbol = renewSymbol;
	static getSubscriptionSymbol = getSubscriptionSymbol;
	
};
