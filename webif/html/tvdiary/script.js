$(document).ready(function() {

  $('#datepicker').datepicker({
          firstDay: 1,
          dateFormat: '@',  //@=ms since 01/01/1970.
          minDate: new Date(min_time * 1000),
          maxDate: 0,
          onSelect: function(val, inst) {
                  // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
                  var chosen  = Math.round(val / 86400000.0) * 86400 + day_start;
                  request_update(chosen);                  
          }
  });

  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  function request_update(chosen)
  {
    $('#title_date').html( " - " + $.datepicker.formatDate("d MM yy", new Date(chosen * 1000)) );

    $('#recorded_inner').html("");
    $('#recorded_spinner').show('fast');
    $('#watched_inner').html("");
    $('#watched_spinner').show('fast');

    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=R",
      success: function(data) {
        $('#recorded_inner').html(data);
        $('#recorded_spinner').hide('slow');
      },
      error: function(_, _, e) {
        if (window.console)
          console.log("ajax error " + e);
        $('#recorded_inner').html("<span>Sorry, unavailable due to server error</span>");
        $('#recorded_spinner').hide('slow');
      }
    });
    
    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + chosen + "&type=W",
      success: function(data) {
        $('#watched_inner').html(data);
        $('#watched_spinner').hide('slow');
      },
      error: function(_, _, e) {
        if (window.console)
          console.log("ajax error " + e);
        $('#watched_inner').html("<span>Sorry, unavailable due to server error</span>");
        $('#watched_spinner').hide('slow');
      }
    });
  }

  // When the page loads, show today's details.
  request_update(Math.floor(new Date().getTime() / 86400000.0) * 86400 + day_start);                  

});
