import { Task } from '../Task';

export type upgradeTargetType = StructureController;

export class TaskUpgrade extends Task {

	static taskName = 'upgrade';
	// @ts-ignore
	target: upgradeTargetType;

	constructor(target: upgradeTargetType, options = {} as TaskOptions) {
		super(TaskUpgrade.taskName, target, options);
		// Settings
		this.settings.targetRange = 3;
		this.settings.workOffRoad = true;
	}

	isValidTask() {
		return (this.creep.carry.energy > 0);
	}

	isValidTarget() {
		return this.target && this.target.my;
	}

	work() {
		return this.creep.upgradeController(this.target);
	}
}

