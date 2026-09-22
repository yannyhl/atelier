/**
 * Critically damped spring (semi-implicit Euler at the fixed step).
 * Used for cursor parallax, hover follow and anything that should settle without overshoot.
 * `frequency` is in Hz; raise `damping` above 1 for heavier, below 1 for bouncier.
 */
export class Spring {

	value: number;
	velocity = 0;
	target: number;

	constructor( initial = 0, public frequency = 1.6, public damping = 1 ) {

		this.value = initial;
		this.target = initial;

	}

	update( dt: number ) {

		const omega = 2 * Math.PI * this.frequency;
		const accel = omega * omega * ( this.target - this.value ) - 2 * this.damping * omega * this.velocity;
		this.velocity += accel * dt;
		this.value += this.velocity * dt;
		return this.value;

	}

	snap( v: number ) {

		this.value = this.target = v;
		this.velocity = 0;

	}

}

export class Spring2 {

	x: Spring;
	y: Spring;

	constructor( frequency = 1.6, damping = 1 ) {

		this.x = new Spring( 0, frequency, damping );
		this.y = new Spring( 0, frequency, damping );

	}

	setTarget( x: number, y: number ) {

		this.x.target = x;
		this.y.target = y;

	}

	update( dt: number ) {

		this.x.update( dt );
		this.y.update( dt );

	}

	snap( x: number, y: number ) {

		this.x.snap( x );
		this.y.snap( y );

	}

}
