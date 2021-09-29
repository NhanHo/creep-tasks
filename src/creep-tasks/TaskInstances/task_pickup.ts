import { Task } from '../Task';

export type pickupTargetType = Resource;

export class TaskPickup extends Task {

	static taskName = 'pickup';
	// @ts-ignore
	target: pickupTargetType;

	constructor(target: pickupTargetType, options = {} as TaskOptions) {
		super(TaskPickup.taskName, target, options);
		this.settings.oneShot = true;
	}

	isValidTask() {
		return this.creep.store.getFreeCapacity() > 0;
	}

	isValidTarget() {
		return this.target && this.target.amount > 0;
	}

	work() {
		return this.creep.pickup(this.target);
	}
}
