import { debounce } from "@nesvet/n";
import EventEmitter from "eventemitter3";
import { privates } from "./common";
import { SubscriptionGroupItem } from "./SubscriptionGroupItem";


function parseDefinition(definition) {
	if (Array.isArray(definition)) {
		const args = definition.slice();
		
		const parsed = {};
		
		parsed.name = args.shift();
		if (typeof args[0] == "object" && !Array.isArray(args[0])) {
			parsed.value = args.shift();
			parsed.type = parsed.value.toString().match(/Subscription(Object|Array|Map)/)[1];
			if (parsed.type)
				parsed.type = parsed.type.toLowerCase();
			else
				throw new Error("Unknown value type");
		} else {
			if (typeof args[0] == "string")
				parsed.type = args.shift();
			if (typeof args[0] == "string")
				parsed.publicationName = args.shift();
			if (Array.isArray(args[0]))
				parsed.params = args.shift();
		}
		if (typeof args[0] == "function")
			parsed.handle = args.shift();
		if (typeof args[0] == "function")
			parsed.onBeforeInit = args.shift();
		if (typeof args[0] == "number")
			parsed.debounceLimit = args.shift();
		if (typeof args[0] == "boolean")
			parsed.preventBind = args.shift();
		
		return parsed;
	}
	
	return definition;
}

export class SubscriptionGroup extends EventEmitter {
	constructor(definitions, options = {}) {
		super();
		
		const {
			target,
			debounce: debounceLimit = SubscriptionGroup.debounceLimit,
			immediately
		} = options;
		
		this.#applyOptions({ target, debounceLimit });
		
		this.#initPromise = new Promise(resolve => (this.#initResolve = resolve));
		
		this.attach(definitions, false, immediately);
		
	}
	
	items = [];
	values = [];
	
	isLoaded = false;
	isInited = false;
	
	#loadPromise;
	#initPromise;
	#unloadPromise;
	#loadResolve;
	#initResolve;
	#unloadResolve;
	
	#debounceLimit = null;
	
	#applyOptions({ target, debounceLimit }) {
		
		if (this.target !== target) {
			if (this.target)
				for (const item of this.items)
					if (item.isLoaded && !item.preventBind)
						delete this.target[item.name];
			
			this.target = target;
			
			if (this.target)
				for (const item of this.items)
					if (item.isLoaded && !item.preventBind)
						this.target[item.name] = item.value;
		}
		
		if (this.#debounceLimit !== debounceLimit) {
			this.#debounceLimit = debounceLimit;
			if (typeof this.#debounceLimit == "number") {
				const emitUpdateDebounced = debounce(() => this.emit("update", this.values), this.#debounceLimit);
				this.emitUpdate = () => emitUpdateDebounced();
			} else
				this.emitUpdate = () => this.emit("update", this.values);
		}
		
	}
	
	attach(definitions, shouldReload = this.isLoaded, immediately = true) {
		if (shouldReload)
			this.isLoaded = false;
		
		if (!this.#loadPromise || this.#loadPromise.isResolved)
			this.#loadPromise = new Promise(resolve => (this.#loadResolve = resolve));
		
		if (!this.#unloadPromise || this.#unloadPromise.isResolved)
			this.#unloadPromise = new Promise(resolve => (this.#unloadResolve = resolve));
		
		return Promise.all(definitions.map(definition =>
			new SubscriptionGroupItem(parseDefinition(definition), this)
		).map(item => {
			
			if (immediately)
				item.subscribe();
			
			return item.loaded();
		}));
	}
	
	detach(names, shouldUpdate = true) {
		
		for (const name of names)
			this.items[name]?.detach();
		
		if (shouldUpdate) {
			this.#unload();
			this.#load();
		}
		
	}
	
	redefine(definitions) {
		
		const itemsToDetach = new Map(this.items.map(item => [ item.name, item ]));
		const definitionsToRedefine = [];
		const definitionsToAttach = [];
		
		for (let definition of definitions) {
			definition = parseDefinition(definition);
			if (itemsToDetach.delete(definition.name))
				definitionsToRedefine.push(definition);
			else
				definitionsToAttach.push(definition);
		}
		
		this.isLoaded = false;
		
		this.detach([ ...itemsToDetach.keys() ], false);
		
		return Promise.all([
			...definitionsToRedefine.map(definition => {
				const item = this.items[definition.name];
				item.define(definition);
				
				item.subscribe();
				
				return item.loaded();
			}),
			...definitionsToAttach.length ? [ this.attach(definitionsToAttach, false) ] : []
		]);
	}
	
	subscribe() {
		return this.items.map(item => item.subscribe());
	}
	
	unsubscribe() {
		return this.items.map(item => item.unsubscribe());
	}
	
	#load() {
		
		if (!this.isLoaded && this.items.every(item => item.isLoaded)) {
			if (this.target)
				for (const item of this.items)
					if (!item.preventBind)
						this.target[item.name] = item.value;
			
			this.isLoaded = true;
			
			for (const item of this.items)
				privates.itemLoad(item);
			
			this.emit("load", this.values);
			
			if (this.isInited)
				if (this.items.length)
					for (const item of this.items)
						item.emitUpdate();
				else
					this.emitUpdate();
			
			
			this.#loadResolve(this);
			this.#loadPromise.isResolved = true;
			
			if (this.#unloadPromise.isResolved)
				this.#unloadPromise = new Promise(resolve => (this.#unloadResolve = resolve));
		}
		
	}
	
	#init() {
		
		if (!this.isInited && this.items.every(item => item.isInited)) {
			this.isInited = true;
			
			if (this.isLoaded)
				if (this.items.length)
					for (const item of this.items)
						item.emitUpdate();
				else
					this.emitUpdate();
			
			
			for (const item of this.items)
				privates.itemInit(item);
			
			this.emit("init", this.values);
			
			this.#initResolve(this);
		}
		
	}
	
	#unload() {
		
		if (this.isLoaded && this.items.every(item => !item.isLoaded)) {
			if (this.target)
				for (const item of this.items)
					if (!item.preventBind)
						delete this.target[item.name];
			
			this.isLoaded = false;
			
			for (const item of this.items)
				privates.itemUnload(item);
			
			this.emit("unload", this.values);
			
			if (this.items.length)
				for (const item of this.items)
					item.emitUpdate();
			else
				this.emitUpdate();
			
			this.#unloadResolve(this);
			this.#unloadPromise.isResolved = true;
			
			if (this.#loadPromise.isResolved)
				this.#loadPromise = new Promise(resolve => (this.#loadResolve = resolve));
		}
		
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
	
	valueOf() {
		return this.values;
	}
	
	[Symbol.iterator]() {
		return this.values[Symbol.iterator]();
	}
	
	
	static debounceLimit = 8;
	
	static {
		
		privates.groupLoad = group => group.#load();
		privates.groupInit = group => group.#init();
		privates.groupUnload = group => group.#unload();
		
	}
	
}
