from django.urls import path
from . import views

urlpatterns = [
    path('add/', views.add_memory, name='add_memory'),
    path('retrieve/', views.retrieve_memories, name='retrieve_memories'),
]