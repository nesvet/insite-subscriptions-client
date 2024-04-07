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


export class SubscriptionObject {
	#handleUpdate;
	
	constructor(updates, onUpdate) {
		this.#handleUpdate = onUpdate;
		
		if (updates)
			this[updateSymbol](updates);
		
	}
	
	#updates = null;
	
	[getHandleUpdateSymbol]() {
		return this.#handleUpdate;
	}
	
	[setHandleUpdateSymbol](handleUpdate) {
		return (this.#handleUpdate = handleUpdate);
	}
	
	[updateSymbol](updates) {
		if (updates) {
			for (const key in this.#updates)
				delete this[key];
			for (const key in updates)
				this[key] = updates[key];
			this.#updates = updates;
		} else
			this[clearSymbol]();
		
		this.#handleUpdate?.(this, this, this.#updates);
		
		return this;
	}
	
	[getAsUpdatesSymbol]() {
		return this.#updates && { ...this.#updates };
	}
	
	[getAsInitialUpdatedSymbol]() {
		return this.valueOf();
	}
	
	[clearSymbol]() {
		
		for (const key in this)
			delete this[key];
		this.#updates = null;
		
	}
	
	valueOf() {
		return this.#updates && this;
	}
	
	get [Symbol.toStringTag]() {
		return "SubscriptionObject";
	}
	
	
	static updateSymbol = updateSymbol;
	static getHandleUpdateSymbol = getHandleUpdateSymbol;
	static setHandleUpdateSymbol = setHandleUpdateSymbol;
	static getAsUpdatesSymbol = getAsUpdatesSymbol;
	static getAsInitialUpdatedSymbol = getAsInitialUpdatedSymbol;
	static clearSymbol = clearSymbol;
	
}


SubscriptionObject.WithSubscription = class SubscriptionObjectWithSubscription extends SubscriptionObject {
	#publicationName;
	#params;
	
	constructor(publicationName, params, onUpdate, immediately = true) {
		super(null, onUpdate);
		
		this.#publicationName = publicationName;
		this.#params = params;
		
		if (immediately)
			this[subscribeSymbol]();
		
	}
	
	#subscription = null;
	
	[subscribeSymbol]() {
		
		if (!this.#subscription)
			this.#subscription = new Subscription("object", this.#publicationName, this.#params, updates => this[updateSymbol](updates));
		
	}
	
	[unsubscribeSymbol]() {
		
		if (this.#subscription) {
			this.#subscription.cancel();
			this.#subscription = null;
		}
		
	}
	
	[renewSymbol](publicationName, params) {
		
		if (this.#subscription) {
			this[unsubscribeSymbol]();
			
			if (publicationName)
				if (Array.isArray(publicationName))
					params = publicationName;
				else
					this.#publicationName = publicationName;
			
			if (params)
				this.#params = params;
			
			this[subscribeSymbol]();
		}
		
	}
	
	[getSubscriptionSymbol]() {
		return this.#subscription;
	}
	
	get [Symbol.toStringTag]() {
		return "SubscriptionObjectWithSubscription";
	}
	
	
	static subscribeSymbol = subscribeSymbol;
	static unsubscribeSymbol = unsubscribeSymbol;
	static renewSymbol = renewSymbol;
	static getSubscriptionSymbol = getSubscriptionSymbol;
	
};
