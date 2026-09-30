import './register.css'

function Register() {
    return (
        <div className="Register_Page">

            <div className="Register_Left">
                <img src="/src/assets/login_page.png" alt="EPMS" />

                <div className="Register_Welcome">
                    <h1>Welcome!</h1>
                    <p>Join EPMS and manage your performance.</p>
                </div>
            </div>

            <div className="Register_Right">

                <div className="Register_Form">

                    <h1>Create Account</h1>
                    <p className="Register_Subtitle">
                        Register to get started
                    </p>

                    <label>Name</label>
                    <input
                        type="text"
                        placeholder="Enter your name"
                        autoComplete="off"
                    />

                    <label>Email</label>
                    <input
                        type="email"
                        placeholder="Enter your email"
                        autoComplete="off"
                    />

                    <label>Password</label>
                    <input
                        type="password"
                        placeholder="Enter password"
                        autoComplete="new-password"
                    />

                    <label>Role</label>
                    <select>
                        <option value="Employee">Employee</option>
                        <option value="Manager">Manager</option>
                        <option value="Senior Authority">
                            Senior Authority
                        </option>
                    </select>

                    <button>Register</button>

                    <p className="Login_Link">
                        Already have an account?
                        <a href="/"> Login</a>
                    </p>

                </div>

            </div>

        </div>
    )
}

export default Register