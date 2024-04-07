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


function makeSort(sort) {
	
	const functionName = `function${performance.now().toString(36).replace(/\./g, "")}`;
	
	const tempScript = document.createElement("script");
	tempScript.textContent = `window.${functionName} = function sort(a, b) { return ${`${Object.entries(sort).map(([ key, value ]) => value > 0 ? `a.${key} > b.${key} ? 1 : a.${key} < b.${key} ? -1 :` : `a.${key} < b.${key} ? 1 : a.${key} > b.${key} ? -1 :`).concat("0").join(" ")};`} }`;
	document.head.append(tempScript);
	tempScript.remove();
	
	const sortFunction = window[functionName];
	
	delete window[functionName];
	
	return sortFunction;
}


export class SubscriptionMap extends Map {
	constructor(updates, onUpdate) {
		super();
		
		if (onUpdate)
			this.handleUpdate = onUpdate;
		
		if (updates)
			this.update(updates);
		
	}
	
	#updates = new Map();
	
	sortList = null;
	
	sortCompareFunction = null;
	
	#fieldsToSort = [];
	
	sorted = [];
	
	sort() {
		
		this.sorted.sort(this.sortCompareFunction);
		
	}
	
	[getHandleUpdateSymbol]() {
		return this.handleUpdate;
	}
	
	[setHandleUpdateSymbol](handleUpdate) {
		return (this.handleUpdate = handleUpdate);
	}
	
	#Item;
	
	set Item(Item) {
		this.#Item = Item;
		
		if (this.size)
			for (const [ _id, item ] of this)
				this.set(_id, new Item(this, item));
		
	}
	
	get Item() {
		return this.#Item;
	}
	
	update(updates) {
		
		const updated = [];
		updated.added = [];
		updated.deleted = [];
		
		if (updates) {
			let shouldSort = false;
			
			const Item = this.#Item;
			const prevUpdates = this.#updates;
			
			for (const update of updates)
				switch (update?.[0]) {
					case "i"/* initial */: {
						const [ , array, sort ] = update;
						
						if (sort) {
							this.sortList = sort;
							this.sortCompareFunction = makeSort(sort);
							this.#fieldsToSort = [ ...new Set(Object.keys(sort).map(key => key.replace(/\..+/, ""))) ];
							shouldSort = true;
						} else {
							this.sortList = null;
							this.sortCompareFunction = null;
							this.#fieldsToSort = [];
						}
						
						if (this.size) {
							const updatesMap = new Map();
							for (const itemUpdates of array)
								updatesMap.set(itemUpdates._id, itemUpdates);
							
							for (const [ _id, item ] of this) {
								const itemUpdates = updatesMap.get(_id);
								if (itemUpdates) {
									const prevItemUpdates = prevUpdates.get(_id);
									
									if (Item)
										item.update(itemUpdates);
									else {
										for (const key in prevItemUpdates)
											delete item[key];
										
										Object.assign(item, itemUpdates);
									}
									
									prevUpdates.set(_id, itemUpdates);
									updated.push(item);
									updatesMap.delete(_id);
								} else {
									if (Item)
										item.delete();
									else
										this.delete(_id);
									prevUpdates.delete(_id);
									updated.deleted.push(_id);
								}
							}
							
							for (const [ _id, itemUpdates ] of updatesMap) {
								const item = Item ? new Item(this, itemUpdates) : { ...itemUpdates };
								this.set(_id, item);
								prevUpdates.set(_id, itemUpdates);
								updated.push(item);
								updated.added.push(item);
							}
							
							if (this.sortList)
								this.sorted = array.map(newItem => this.get(newItem._id));
							
						} else
							for (const itemUpdates of array) {
								const item = Item ? new Item(this, itemUpdates) : { ...itemUpdates };
								this.set(item._id, item);
								this.sorted.push(item);
								prevUpdates.set(item._id, itemUpdates);
								updated.push(item);
								updated.added.push(item);
							}
						
						break;
					}
					
					case "c"/* create */:
					case "u"/* update */: {
						let itemUpdates = update[1];
						let item = this.get(itemUpdates._id);
						
						if (item) {
							const isAtomic = update[2] === true;
							const updatedFields = isAtomic ? Object.keys(itemUpdates) : update[2];
							const prevItemUpdates = prevUpdates.get(item._id);
							
							if (Item)
								item.update(itemUpdates);
							else {
								if (!isAtomic)
									for (const key in prevItemUpdates)
										delete item[key];
								
								Object.assign(item, itemUpdates);
							}
							
							if (isAtomic)
								itemUpdates = Object.assign(prevItemUpdates, itemUpdates);
							
							if (this.sortList && !shouldSort && (!updatedFields || updatedFields.some(fieldName => this.#fieldsToSort.includes(fieldName))))
								shouldSort = true;
						} else {
							item = Item ? new Item(this, itemUpdates) : { ...itemUpdates };
							this.set(item._id, item);
							this.sorted.push(item);
							if (this.sortList)
								shouldSort = true;
							updated.added.push(item);
						}
						
						prevUpdates.set(item._id, itemUpdates);
						updated.push(item);
						
						break;
					}
					
					case "d"/* delete */: {
						const _id = update[1];
						const itemToDelete = this.get(_id);
						
						if (itemToDelete) {
							if (Item)
								itemToDelete.delete();
							else
								this.delete(_id);
							prevUpdates.delete(_id);
							removeOne(this.sorted, itemToDelete);
							updated.deleted.push(_id);
						}
						
						break;
					}
					
					default:
						this.clear();
				}
			
			if (shouldSort)
				this.sort();
			
		} else
			this.clear();
		
		this.handleUpdate?.(this, updated, updates?.[0] && updates);
		
		return this;
	}
	
	[updateSymbol] = this.update;
	
	getAsUpdates() {
		return (
			(this.size || this.sortList) ?
				[ [ "i"/* initial */, [ ...this.#updates.values() ], this.sortList ] ] :
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
		
		super.clear();
		this.#updates.clear();
		this.sorted = [];
		this.sortList = null;
		this.sortCompareFunction = null;
		this.#fieldsToSort = [];
		
	}
	
	[clearSymbol] = this.clear;
	
	valueOf() {
		return this.sorted;
	}
	
	get [Symbol.toStringTag]() {
		return "SubscriptionMap";
	}
	
	
	static updateSymbol = updateSymbol;
	static getHandleUpdateSymbol = getHandleUpdateSymbol;
	static setHandleUpdateSymbol = setHandleUpdateSymbol;
	static getAsUpdatesSymbol = getAsUpdatesSymbol;
	static getAsInitialUpdatedSymbol = getAsInitialUpdatedSymbol;
	static clearSymbol = clearSymbol;
	
}


SubscriptionMap.WithSubscription = class SubscriptionMapWithSubscription extends SubscriptionMap {
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
			this.subscription = new Subscription("map", this.publicationName, this.params, updates => this.update(updates));
		
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
		return "SubscriptionMapWithSubscription";
	}
	
	
	static subscribeSymbol = subscribeSymbol;
	static unsubscribeSymbol = unsubscribeSymbol;
	static renewSymbol = renewSymbol;
	static getSubscriptionSymbol = getSubscriptionSymbol;
	
};


SubscriptionMap.Item = class SubscriptionMapItem {
	constructor(map, updates) {
		this.#map = map;
		
		this.update(updates);
		
	}
	
	#map;
	
	update(updates) {
		Object.assign(this, updates);
		
	}
	
	delete() {
		
		this.#map.delete(this._id);
		
	}
	
};
