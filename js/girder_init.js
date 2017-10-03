/*
* Girder API + UI initialization
*/
$(function () {
  girder.rest.setApiRoot(config.girder_root + 'api/v1');
  girder.rest.setStaticRoot(config.girder_root + 'static');
  girder.router.enabled(false);

  $('#login').click(function () {
    var loginView = new girder.views.layout.LoginView({
      el: $('#dialog-container')
    });
    loginView.render();
  });

  $('#register').click(function () {
    var registerView = new girder.views.layout.RegisterView({
      el: $('#dialog-container')
    });
    registerView.render();
  });

  $('#logout').click(function () {
    console.log("logout");
    girder.rest.restRequest({
      path: 'user/authentication',
      type: 'DELETE'
    }).done(function () {
      girder.auth.setCurrentUser(null);
      girder.events.trigger('g:login');
    });
  });

  girder.events.on('g:login', function () {
    console.log("g:login");
    if (girder.auth.getCurrentUser()) {
      $("#login").addClass("hidden");
      $("#register").addClass("hidden");
      $("#name").removeClass("hidden");
      $("#logout").removeClass("hidden");
      $("#name").text(girder.auth.getCurrentUser().get('firstName') + " " + girder.auth.getCurrentUser().get('lastName'));

      // Do anything else you'd like to do on login.
    } else {
      $("#login").removeClass("hidden");
      $("#register").removeClass("hidden");
      $("#name").addClass("hidden");
      $("#logout").addClass("hidden");

      // Do anything else you'd like to do on logout.
    }
  });

  // Check for who is logged in initially
  girder.rest.restRequest({
    path: 'user/authentication',
    error: null
  }).done(function (resp) {
    girder.auth.setCurrentUser(new girder.models.UserModel(resp.user));
    girder.events.trigger('g:login');
  });

});
