import { debounce, removeOne } from "@nesvet/n";
import EventEmitter from "eventemitter3";
import { SubscriptionArray } from "../SubscriptionArray";
import { SubscriptionMap } from "../SubscriptionMap";
import { SubscriptionObject } from "../SubscriptionObject";
import {
	getAsInitialUpdatedSymbol,
	getAsUpdatesSymbol,
	getHandleUpdateSymbol,
	renewSymbol,
	setHandleUpdateSymbol,
	subscribeSymbol,
	unsubscribeSymbol
} from "../symbols";
import { privates } from "./common";


const SubscriptionValuesByType = {
	object: SubscriptionObject,
	array: SubscriptionArray,
	map: SubscriptionMap
};


export class SubscriptionGroupItem extends EventEmitter {
	constructor(definition, group) {
		super();
		
		this.name = definition.name;
		
		this.define(definition, group);
		
	}
	
	isLoaded = false;
	isInited = false;
	
	#loadPromise;
	#initPromise;
	#unloadPromise;
	#loadResolve;
	#initResolve;
	#unloadResolve;
	
	define(definition, group = this.group) {
		
		const {
			value,
			type = "object",
			publicationName,
			params,
			handle,
			onBeforeInit,
			debounce: debounceLimit = SubscriptionGroupItem.debounceLimit,
			preventBind
		} = definition;
		
		if (this.group) {
			if (
				(!value || this.value === value) &&
				this.type === type &&
				this.publicationName === publicationName &&
				JSON.stringify(this.params) === JSON.stringify(params) &&
				this.handle === handle &&
				this.onBeforeInit === onBeforeInit
			)
				return this.#applyOptions({ debounceLimit, preventBind });
			
			this.detach();
			delete this.value;
			delete this.publicationName;
			delete this.params;
		}
		
		this.type = type;
		this.handle = handle;
		this.onBeforeInit = onBeforeInit;
		if (value)
			this.value = value;
		else {
			this.publicationName = publicationName ?? this.name;
			this.params = params ?? [];
		}
		
		this.#applyOptions({ debounceLimit, preventBind });
		
		this.#attachTo(group);
		
	}
	
	#applyOptions({ debounceLimit, preventBind }) {
		
		const emitUpdate = updated => {
			this.emit("update", this.value, updated);
			this.group.emit(`update.${this.name}`, this.value, updated);
			this.group.emitUpdate();
			
		};
		
		if (typeof debounceLimit == "number") {
			let debouncedUpdated;
			let group;
			
			const emitUpdateDebounced = debounce(() => {
				
				const isDetached = !this.group;
				
				if (isDetached)
					this.group = group;
				
				emitUpdate(debouncedUpdated);
				
				if (isDetached)
					delete this.group;
				
				debouncedUpdated = undefined;
				
			}, debounceLimit);
			
			this.emitUpdate = updated => {
				if (updated !== undefined)
					if (Array.isArray(updated))
						if (debouncedUpdated)
							for (const item of updated)
								debouncedUpdated.push(item);
						else
							debouncedUpdated = [ ...updated ];
					else if (typeof updated == "object")
						if (debouncedUpdated)
							Object.assign(debouncedUpdated, updated);
						else
							debouncedUpdated = { ...updated };
					else
						debouncedUpdated = updated;
				
				({ group } = this);
				
				return emitUpdateDebounced();
			};
		} else
			this.emitUpdate = emitUpdate;
		
		if (this.preventBind === undefined)
			delete this.preventBind;
		else
			this.preventBind = preventBind;
		
	}
	
	#attachTo(group) {
		this.group = group;
		
		this.group.items.push(this);
		this.group.items[this.name] = this;
		
		if (!this.#loadPromise || this.#loadPromise.isResolved)
			this.#loadPromise = new Promise(resolve => (this.#loadResolve = resolve));
		
		if (!this.#initPromise || this.#initPromise.isResolved)
			this.#initPromise = new Promise(resolve => (this.#initResolve = resolve));
		
		if (!this.#unloadPromise || this.#unloadPromise.isResolved)
			this.#unloadPromise = new Promise(resolve => (this.#unloadResolve = resolve));
		
		if (this.value)
			this.value[setHandleUpdateSymbol](this.#handleSubscription);
		else
			this.value = new SubscriptionValuesByType[this.type].WithSubscription(this.publicationName, this.params, this.#handleSubscription, false);
		
		this.group.values.push(this.value);
		this.group.values[this.name] = this.value;
		
		this.onBeforeInit?.call(this.group, this.value);
		
	}
	
	detach() {
		
		this.value[unsubscribeSymbol]?.();
		
		this.isLoaded = false;
		this.#unload();
		
		delete this.group.values[this.name];
		removeOne(this.group.values, this.value);
		delete this.group.items[this.name];
		removeOne(this.group.items, this);
		
		delete this.group;
		
	}
	
	#loadUpdated = null;
	
	#handleSubscription = (_, updated, updates) => {
		if (updates)
			if (this.group.isLoaded) {
				this.handle?.call(this.group, updated, this.group);
				this.emitUpdate(updated);
			} else {
				this.#loadUpdated = updated;
				this.isLoaded = true;
				privates.groupLoad(this.group);
			}
		 else if (this.isLoaded) {
			this.isLoaded = false;
			privates.groupUnload(this.group);
		}
		
		if (!this.isInited) {
			this.isInited = true;
			privates.groupInit(this.group);
		}
		
	};
	
	#load() {
		
		if (this.#loadUpdated) {
			this.handle?.call(this.group, this.#loadUpdated, this.group);
			this.#loadUpdated = null;
			
			this.emit("load", this.value);
			
			this.#loadResolve(this);
			this.#loadPromise.isResolved = true;
			
			if (this.#unloadPromise.isResolved)
				this.#unloadPromise = new Promise(resolve => (this.#unloadResolve = resolve));
		}
		
	}
	
	#init() {
		
		this.emit("init", this.value);
		
		this.#initResolve(this);
		this.#initPromise.isResolved = true;
		
	}
	
	#unload() {
		
		this.handle?.call(this.group, null, this.group);
		
		this.emit("unload", this.value);
		
		this.#unloadResolve(this);
		this.#unloadPromise.isResolved = true;
		
		if (this.#loadPromise.isResolved)
			this.#loadPromise = new Promise(resolve => (this.#loadResolve = resolve));
		
	}
	
	loaded() {
		return this.#loadPromise;
	}
	
	inited() {
		return this.#initPromise;
	}
	
	unloaded() {
		return this.#unloadPromise;
	}
	
	subscribe() {
		return (
			this.value[subscribeSymbol] ?
				this.value[subscribeSymbol]() :
				this.value[getHandleUpdateSymbol]()(this.value, this.value[getAsInitialUpdatedSymbol](), this.value[getAsUpdatesSymbol]())
		);
	}
	
	unsubscribe() {
		return this.value[unsubscribeSymbol]?.();
	}
	
	renew(publicationName, params) {
		return this.value[renewSymbol]?.(publicationName, params);
	}
	
	valueOf() {
		return this.value;
	}
	
	
	static debounceLimit = 4;
	
	static {
		
		privates.itemLoad = item => item.#load();
		privates.itemInit = item => item.#init();
		privates.itemUnload = item => item.#unload();
		
	}
	
}
