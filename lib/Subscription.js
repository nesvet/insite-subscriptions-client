//#if _SSR
// import { publications } from "insite-subscriptions-server";


// export const initialsMap = new Map();

// export const subscriptionContext = {};

// export async function Subscription(type, publicationName, args = [], handler) {
// 	const value = await publications.get(publicationName)?.fetch(subscriptionContext, ...args);

// 	subscriptionContext.initials.push(JSON.stringify(value));

// 	handler(value);

// }


//#else
let i, subscriptions, ws;

export class Subscription {
	constructor(type, publicationName, args = [], handler, immediately = true) {
		
		if (!ws)
			throw new Error("Subscription is not binded to WS. Do Subscription.bindTo(ws) first");
		
		this.i = i++;
		this.type = type;
		this.publicationName = publicationName;
		this.args = args;
		this.handler = handler;
		this.immediately = immediately && !window.__initials;
		
		subscriptions.set(this.i, this);
		
		ws.on("open", this.start);
		
		if (ws.isOpen)
			this.start();
		
		if (window.__initials) {
			this.isActive = true;
			this.handler(window.__initials.splice(0, 1)[0]);
		} else
			this.isActive = false;
		
	}
	
	start = () => {
		
		ws.sendMessage("s-s"/* subscription subscribe */, this.type, this.publicationName, this.i, this.args, this.immediately);
		
		this.immediately = true;
		
	};
	
	cancel() {
		
		subscriptions.delete(this.i);
		
		ws.off("open", this.start);
		
		ws.sendMessage("s-u"/* subscription unsubscribe */, this.i);
		
	}
	
	
	static bindTo(_ws) {
		ws = _ws;
		
		i = 0;
		
		subscriptions =
			Subscription.subscriptions =
				new Map();
		
		ws.on("message:s-c"/* subscription changed */, (_i, data) => {
			const subscription = subscriptions.get(_i);
			if (subscription) {
				subscription.isActive = true;
				subscription.handler(data);
			}
			
		});
		
		ws.on("close", () => {
			
			for (const subscription of subscriptions.values())
				subscription.isActive = false;
			
		});
		
		ws.on("server-change", () => {
			
			for (const subscription of subscriptions.values())
				subscription.handler(null);
			
		});
		
	}
	
}


//#endif
